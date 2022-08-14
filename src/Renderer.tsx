
import {ShallowWaterSolver} from "./ShallowWaterSolver";
import {WebGLEntity, VerticesType, TexCoordsType} from "./WebGLEntity";
import {seismic_colormap} from "./colormap";

const render_vertex_shader_src = require('./glsl/render_vertex.glsl');
const render_fragment_shader_src = require('./glsl/render.glsl');

class Renderer extends WebGLEntity {
    solver: ShallowWaterSolver;

    program: WebGLProgram;

    vertices: VerticesType;
    offsets: VerticesType;
    texcoords: VerticesType;
    cmap_texture: TexCoordsType;

    u_dot_size: WebGLUniformLocation;
    u_aspect: WebGLUniformLocation;
    u_sampler: WebGLUniformLocation;
    u_unit: WebGLUniformLocation;

    constructor(solver: ShallowWaterSolver) {
        super();

        this.solver = solver;

        this.setup();
    }

    setup() : void {
        const gl = this.solver.gl;

        gl.getExtension('OES_texture_float');
        gl.getExtension('OES_texture_float_linear');
        gl.getExtension('WEBGL_color_buffer_float');

        this.program = this._compileAndLinkShaders(gl, render_vertex_shader_src, render_fragment_shader_src);

        const render_verts = new Float32Array([0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
        const render_offsets = new Float32Array([-1.0, -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0]);
        const tex_coords = new Float32Array([0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0]);

        this.vertices = this._setupVertices(gl, this.program, render_verts, 2, 'a_pos');
        this.offsets = this._setupVertices(gl, this.program, render_offsets, 2, 'a_offset');
        this.u_dot_size = gl.getUniformLocation(this.program, 'u_dot_size');
        this.u_aspect = gl.getUniformLocation(this.program, 'u_aspect');
        this.u_unit = gl.getUniformLocation(this.program, 'u_unit');
        this.u_sampler = gl.getUniformLocation(this.program, 'u_sampler');

        const cmap_image = {'format': gl.RGBA, 'type': gl.UNSIGNED_BYTE, 'image': seismic_colormap.getImage(), 'mag_filter': gl.LINEAR};
        this.cmap_texture = this._setupTexture(gl, cmap_image, this.program, 'u_colormap_sampler');

        this.texcoords = this._setupVertices(gl, this.program, tex_coords, 2, 'a_tex_coord');
    }

    render() : void {
        const gl = this.solver.gl;
        const grid = this.solver.grid;

        gl.useProgram(this.program);
        gl.viewport(0, 0, grid['nx'] * 2, grid['ny'] * 2);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        const state_texture = {
            'attributes': {},
            'uniforms': {'u_sampler': this.u_sampler},
            'texture': this.solver.getStateTexture()
        };

        this._bindVertices(gl, this.vertices);
        this._bindVertices(gl, this.offsets);
        this._bindVertices(gl, this.texcoords);
        this._bindTexture(gl, 1, state_texture);
        this._bindTexture(gl, 0, this.cmap_texture);

        gl.uniform1f(this.u_aspect, grid['nx'] / grid['ny']);
        gl.uniform2f(this.u_unit, 1 / grid['nx'], 1 / grid['ny']);
        gl.uniform1f(this.u_dot_size, 0.1);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
}

export default Renderer;