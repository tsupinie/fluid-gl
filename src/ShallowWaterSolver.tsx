
import {WebGLEntity, VerticesType, TexCoordsType} from "./WebGLEntity";

const vertex_shader_src = require('./glsl/vertex.glsl');
const solver_fragment_shader_src = require('./glsl/solver.glsl');
const inject_fragment_shader_src = require('./glsl/inject.glsl');
const render_fragment_shader_src = require('./glsl/render.glsl');

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

interface StateFramebufferType {
    framebuffer: WebGLFramebuffer;
    texture: TexCoordsType;
    sampler: WebGLUniformLocation;
}

class ShallowWaterSolver extends WebGLEntity {
    grid: GridType;
    state: ShallowWaterStateType;
    is_initialized: boolean;

    verts: Float32Array;
    tex_coords: Float32Array;

    program: WebGLProgram;
    inject_program: WebGLProgram;
    render_program: WebGLProgram;

    vertices: VerticesType;
    inject_vertices: VerticesType;
    render_vertices: VerticesType;
    texcoords: VerticesType;
    render_texcoords: VerticesType;

    render_u_sampler: WebGLUniformLocation;
    render_u_unit: WebGLUniformLocation;
    u_unit: WebGLUniformLocation;
    u_dx: WebGLUniformLocation;
    u_dt: WebGLUniformLocation;
    u_istage: WebGLUniformLocation;

    stages: StateFramebufferType[];
    inject_state_fb: StateFramebufferType;

    constructor(grid: GridType, initial_state: ShallowWaterStateType) {
        super();

        this.grid = grid;
        this.state = initial_state;

        this.is_initialized = false;
    }

    setup(gl: WebGLRenderingContext) {
        gl.getExtension('OES_texture_float');
        gl.getExtension('OES_texture_float_linear');
        gl.getExtension('WEBGL_color_buffer_float');

        this.inject_program = this._compileAndLinkShaders(gl, vertex_shader_src, inject_fragment_shader_src);
        this.program = this._compileAndLinkShaders(gl, vertex_shader_src, solver_fragment_shader_src);
        this.render_program = this._compileAndLinkShaders(gl, vertex_shader_src, render_fragment_shader_src);

        this.verts = new Float32Array([-1.0, 1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0]);
        this.tex_coords = new Float32Array([0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0]);

        this.inject_vertices = this._setupVertices(gl, this.inject_program, this.verts, 2, 'a_pos');
        this.vertices = this._setupVertices(gl, this.program, this.verts, 2, 'a_pos');
        this.render_vertices = this._setupVertices(gl, this.render_program, this.verts, 2, 'a_pos');

        this.texcoords = this._setupVertices(gl, this.program, this.tex_coords, 2, 'a_tex_coord');
        this.render_texcoords = this._setupVertices(gl, this.render_program, this.tex_coords, 2, 'a_tex_coord');

        this.render_u_sampler = gl.getUniformLocation(this.render_program, 'u_sampler');
        this.render_u_unit = gl.getUniformLocation(this.render_program, 'u_unit');

        // Set up model state textures and framebuffers
        this.u_unit = gl.getUniformLocation(this.program, 'u_unit');
        this.u_dx = gl.getUniformLocation(this.program, 'u_dx');
        this.u_dt = gl.getUniformLocation(this.program, 'u_dt');
        this.u_istage = gl.getUniformLocation(this.program, 'u_istage');

        const state_img = {
            'format': gl.RGBA, 'type': gl.FLOAT, 
            'width': this.grid['nx'], 'height': this.grid['ny'], 'image': null,
            'mag_filter': gl.LINEAR
        }

        const n_stages = 3;
        this.stages = [];

        for (let istg = 0; istg < n_stages + 1; istg++) {
            const sampler = gl.getUniformLocation(this.program, `u_stage${istg}_sampler`);
            const framebuffer = gl.createFramebuffer();
            const texture = this._setupTexture(gl, state_img);
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture['texture'], 0);

            this.stages.push({'framebuffer': framebuffer, 'texture': texture, 'sampler': sampler});
        }

        this.inject_state_fb = {
            'framebuffer': gl.createFramebuffer(),
            'texture': this._setupTexture(gl, state_img),
            'sampler': gl.getUniformLocation(this.inject_program, 'u_sampler_cur')
        };

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.inject_state_fb['framebuffer']);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.inject_state_fb['texture']['texture'], 0);

        this.inject_state(gl, this.state);

        this.is_initialized = true;
    }

    inject_state(gl: WebGLRenderingContext, state: ShallowWaterStateType, clear_state?: boolean) {
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

        const texture = this._setupTexture(gl, state_img, this.inject_program, 'u_sampler_new', this.tex_coords, 'a_tex_coord');  

        // Combine the current state and new texture into the injection framebuffer
        gl.useProgram(this.inject_program);

        if (clear_state) {
            // If we want to clear first, clear the main state buffer
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.stages[0]['framebuffer']);
            gl.clearColor(0., 0., 0., 1.);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.inject_state_fb['framebuffer']);
        gl.viewport(0, 0, this.grid['nx'], this.grid['ny']);

        const main_state_texture = {'attributes': {}, 'uniforms': {'sampler': this.inject_state_fb['sampler']}, 'texture': this.stages[0]['texture']['texture']};

        this._bindVertices(gl, this.inject_vertices);
        this._bindTexture(gl, 0, texture);
        this._bindTexture(gl, 1, main_state_texture);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        
        // Now copy the injection framebuffer back into the main state
        this._bindTexture(gl, 0, main_state_texture);
        gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, this.grid['nx'], this.grid['ny'], 0);

        // Delete injected state texture
        gl.deleteTexture(texture['texture']);
        gl.deleteBuffer(texture['tex_coord']);
    }

    advance(gl: WebGLRenderingContext, dt: number) {
        if (!this.is_initialized) return;

        gl.useProgram(this.program);
        gl.viewport(0, 0, this.grid['nx'], this.grid['ny']);

        this._bindVertices(gl, this.vertices);
        this._bindVertices(gl, this.texcoords);

        gl.uniform2f(this.u_unit, 1 / this.grid['nx'], 1 / this.grid['ny']);
        gl.uniform1f(this.u_dx, this.grid['dx']);
        gl.uniform1f(this.u_dt, dt);

        // Clear all intermediate buffers
        gl.clearColor(0., 0., 0., 1.);
        for (let istg = 1; istg < this.stages.length; istg++) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.stages[istg]['framebuffer']);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }

        // Unbind previous textures
        for (let istg = 0; istg < this.stages.length - 1; istg++) {
            gl.activeTexture(gl['TEXTURE' + istg]);
            gl.bindTexture(gl.TEXTURE_2D, null);
        }

        // Advance model state
        for (let istg = 0; istg < this.stages.length - 1; istg++) {
            gl.uniform1i(this.stages[istg]['sampler'], istg);
            this._bindTexture(gl, istg, this.stages[istg]['texture']);

            gl.bindFramebuffer(gl.FRAMEBUFFER, this.stages[istg + 1]['framebuffer']);
            gl.uniform1i(this.u_istage, istg);

            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }

        // Copy post state back to main state framebuffer
        this._bindTexture(gl, 0, this.stages[0]['texture']);
        gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, this.grid['nx'], this.grid['ny'], 0);
    }

    render(gl: WebGLRenderingContext) {
        if (!this.is_initialized) return;

        gl.useProgram(this.render_program);
        gl.viewport(0, 0, (this.grid['nx'] - 1) * 2, (this.grid['ny'] - 1) * 2);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        this._bindVertices(gl, this.render_vertices);
        this._bindVertices(gl, this.render_texcoords);
        this._bindTexture(gl, 0, this.stages[0]['texture'], false);
        gl.uniform1i(this.render_u_sampler, 0);
        gl.uniform2f(this.render_u_unit, 1 / this.grid['nx'], 1 / this.grid['ny']);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
}

export {ShallowWaterSolver, GridType, ShallowWaterStateType};