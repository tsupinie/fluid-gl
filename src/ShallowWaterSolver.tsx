
import { WGLBuffer, WGLFramebuffer, flipFlopBuffers, WGLProgram, WGLTexture, WGLTextureSpec } from "autumn-wgl";

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
    gl: WebGL2RenderingContext
    grid: GridType;

    program: WGLProgram;
    inject_program: WGLProgram;

    vertices: WGLBuffer;
    texcoords: WGLBuffer;

    main_state_fb: WGLFramebuffer;
    aux_fb: WGLFramebuffer[];

    constructor(gl: WebGL2RenderingContext, grid: GridType, initial_state: ShallowWaterStateType) {
        this.gl = gl;
        this.grid = grid;

        this.setup();

        // Inject the initial state
        this.injectState(initial_state, true); 
    }

    setup() : void {
        const gl = this.gl;

        gl.getExtension('OES_texture_float');
        gl.getExtension('OES_texture_float_linear');
        gl.getExtension('EXT_color_buffer_float');

        // Compile the shader programs
        this.program = new WGLProgram(gl, solver_vertex_shader_src, solver_fragment_shader_src);
        this.inject_program = new WGLProgram(gl, solver_vertex_shader_src, inject_fragment_shader_src);

        // Setup vertex and texture coordinate buffers
        const verts = new Float32Array([-1.0, 1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0]);
        const tex_coords = new Float32Array([0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0]);

        this.vertices = new WGLBuffer(gl, verts, 2, gl.TRIANGLE_STRIP);
        this.texcoords = new WGLBuffer(gl, tex_coords, 2, gl.TRIANGLE_STRIP);

        // Setup the main state and auxiliary rendering framebuffers
        const state_img = {
            'format': gl.RGBA32F, 'type': gl.FLOAT, 
            'width': this.grid['nx'], 'height': this.grid['ny'], 'image': null,
            'mag_filter': gl.LINEAR
        }

        const createFramebufferTexture = (img: WGLTextureSpec): WGLFramebuffer => {
            const texture = new WGLTexture(gl, state_img)
            return new WGLFramebuffer(gl, texture);
        }

        this.main_state_fb = createFramebufferTexture(state_img);

        this.aux_fb = [];
        for (let istg = 0; istg < 2; istg++) {
            this.aux_fb.push(createFramebufferTexture(state_img));
        }
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
            'format': gl.RGBA32F, 'type': gl.FLOAT, 
            'width': this.grid['nx'], 'height': this.grid['ny'], 'image': img_data
        }

        const temp_framebuffer = this.aux_fb[0];
        const temp_texture = this.aux_fb[1].texture;

        temp_texture.setImageData(state_img);

        // Combine the current state and new texture into a temporary framebuffer
        this.inject_program.use(
            {'a_pos': this.vertices, 'a_tex_coord': this.texcoords},
            {},
            {'u_sampler_new': temp_texture, 'u_sampler_cur': this.main_state_fb.texture}
        );

        if (clear_state) {
            this.main_state_fb.clear([0., 0., 0., 1.]);
        }

        temp_framebuffer.renderTo(0, 0, this.grid['nx'], this.grid['ny']);
        this.inject_program.draw();
        
        // Now copy the temporary framebuffer back into the main state
        temp_framebuffer.copyToTexture(this.main_state_fb.texture, 0, 0, this.grid['nx'], this.grid['ny']);
    }

    advance(dt: number) : void {
        this.program.use(
            {'a_pos': this.vertices, 'a_tex_coord': this.texcoords},
            {'u_unit': [1 / this.grid['nx'], 1 / this.grid['ny']], 'u_dx': this.grid['dx'], 'u_dt': dt},
        );

        const doRK3Stage = (src_fb: WGLFramebuffer, dest_fb: WGLFramebuffer, istage: number) : void => {
            this.program.bindTextures({'u_sampler': src_fb.texture, 'u_time_t_sampler': this.main_state_fb.texture});
            this.program.setUniforms({'u_istage': istage});

            dest_fb.renderTo(0, 0, this.grid['nx'], this.grid['ny']);
            this.program.draw();
        }

        // Advance model state
        const n_stages = 3;        
        const result_fb = flipFlopBuffers(n_stages, this.main_state_fb, this.aux_fb, doRK3Stage);

        // Copy post state back to main state framebuffer
        result_fb.copyToTexture(this.main_state_fb.texture, 0, 0, this.grid['nx'], this.grid['ny']);
    }

    getStateTexture() : WGLTexture {
        return this.main_state_fb.texture;
    }
}

export {ShallowWaterSolver, GridType, ShallowWaterStateType};