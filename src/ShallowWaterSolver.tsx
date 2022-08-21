
import { WGLBuffer } from "./wgl/WebGLBuffer";
import { WGLFramebuffer } from "./wgl/WebGLFramebuffer";
import { WGLProgram } from "./wgl/WebGLProgram";
import { WGLTexture, WGLTextureSpec } from "./wgl/WebGLTexture";

const solver_vertex_shader_src = require('./glsl/solver_vertex.glsl');

const solver_fragment_shader_src = require('./glsl/solver.glsl');
const inject_fragment_shader_src = require('./glsl/inject.glsl');

interface GridType {
    nx: number;
    ny: number;
    dx: number;
}

interface ShallowWaterStateType {
    u: Float32Array;
    v: Float32Array;
    z: Float32Array;
}

class ShallowWaterSolver {
    gl: WebGLRenderingContext
    grid: GridType;
    state: ShallowWaterStateType;

    program: WGLProgram;
    inject_program: WGLProgram;

    vertices: WGLBuffer;
    texcoords: WGLBuffer;

    main_state_fb: WGLFramebuffer;
    stages: WGLFramebuffer[];
    inject_state_fb: WGLFramebuffer;

    constructor(gl: WebGLRenderingContext, grid: GridType, initial_state: ShallowWaterStateType) {
        this.gl = gl;
        this.grid = grid;
        this.state = initial_state;

        this.setup();
    }

    setup() : void {
        const gl = this.gl;

        gl.getExtension('OES_texture_float');
        gl.getExtension('OES_texture_float_linear');
        gl.getExtension('WEBGL_color_buffer_float');

        // Compile the shader programs
        this.program = new WGLProgram(gl, solver_vertex_shader_src, solver_fragment_shader_src);
        this.inject_program = new WGLProgram(gl, solver_vertex_shader_src, inject_fragment_shader_src);

        const verts = new Float32Array([-1.0, 1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0]);
        const tex_coords = new Float32Array([0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0]);

        // Setup vertex and texture coordinate buffers
        this.vertices = new WGLBuffer(gl, verts, 2);
        this.texcoords = new WGLBuffer(gl, tex_coords, 2);

        // Setup framebuffers and associated textures for the 3 stages of the RK3 integration
        const n_stages = 3;
        this.stages = [];

        const state_img = {
            'format': gl.RGBA, 'type': gl.FLOAT, 
            'width': this.grid['nx'], 'height': this.grid['ny'], 'image': null,
            'mag_filter': gl.LINEAR
        }

        const createFramebufferTexture = (img: WGLTextureSpec): WGLFramebuffer => {
            const texture = new WGLTexture(gl, state_img)
            return new WGLFramebuffer(gl, texture);
        }

        this.main_state_fb = createFramebufferTexture(state_img);

        for (let istg = 0; istg < n_stages; istg++) {
            this.stages.push(createFramebufferTexture(state_img));
        }

        // Setup the framebuffer for the state injection.
        this.inject_state_fb = createFramebufferTexture(state_img);

        this.injectState(this.state);
    }

    injectState(state: ShallowWaterStateType, clear_state?: boolean) : void {
        const gl = this.gl;
        clear_state = clear_state === undefined ? false : clear_state;

        if (state['z'].length != this.grid['nx'] * this.grid['ny']) {
            throw `Grid dimensions (${this.grid['nx']}, ${this.grid['ny']}) and data length ${state['z'].length} do not match`;
        }
        
        // Set up texture for new state
        const img_data = new Float32Array(state['z'].length * 4);
        for (let idx = 0; idx < state['z'].length; idx++) {
            img_data[4 * idx + 0] = state['z'][idx];
            img_data[4 * idx + 1] = state['u'][idx];
            img_data[4 * idx + 2] = state['v'][idx];
            img_data[4 * idx + 3] = 0.;
        }

        const state_img = {
            'format': gl.RGBA, 'type': gl.FLOAT, 
            'width': this.grid['nx'], 'height': this.grid['ny'], 'image': img_data,
            'mag_filter': gl.LINEAR
        }

        const texture = new WGLTexture(gl, state_img);

        // Combine the current state and new texture into the injection framebuffer
        this.inject_program.use(
            {'a_pos': this.vertices, 'a_tex_coord': this.texcoords},
            {},
            {'u_sampler_new': texture, 'u_sampler_cur': this.main_state_fb.texture}
        );

        if (clear_state) {
            this.main_state_fb.clear([0., 0., 0., 1.]);
        }

        this.inject_state_fb.renderTo();
        gl.viewport(0, 0, this.grid['nx'], this.grid['ny']);

        // Move this to the program class
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        
        // Now copy the injection framebuffer back into the main state
        this.main_state_fb.texture.activate(0);
        gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, this.grid['nx'], this.grid['ny'], 0);

        // Delete injected state texture
        texture.delete();
    }

    advance(dt: number) : void {
        const gl = this.gl;

        this.program.use(
            {'a_pos': this.vertices, 'a_tex_coord': this.texcoords},
            {'u_unit': [1 / this.grid['nx'], 1 / this.grid['ny']], 'u_dx': this.grid['dx'], 'u_dt': dt},
        );

        gl.viewport(0, 0, this.grid['nx'], this.grid['ny']);

        // Clear all intermediate buffers
        this.stages.forEach(stg => stg.clear([0., 0., 0., 1.]));

        // Unbind previous textures
        for (let istg = 0; istg < this.stages.length; istg++) {
            gl.activeTexture(gl['TEXTURE' + istg]);
            gl.bindTexture(gl.TEXTURE_2D, null);
        }

        // Advance model state (3 calls to gl.drawArrays correspond to the 3 stages of the RK3 time integration)
        const tex_map = {};
        this.stages.forEach((stg, istg) => {
            tex_map[`u_stage${istg}_sampler`] = istg == 0 ? this.main_state_fb.texture : this.stages[istg - 1].texture;
            this.program.bindTextures(tex_map);
            this.program.setUniforms({'u_istage': istg});
            stg.renderTo();

            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        });

        // Copy post state back to main state framebuffer
        this.main_state_fb.texture.activate(0);
        gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, this.grid['nx'], this.grid['ny'], 0);
    }

    getStateTexture() : WebGLTexture {
        return this.main_state_fb.texture.texture;
    }
}

export {ShallowWaterSolver, GridType, ShallowWaterStateType};