
import {ShallowWaterSolver} from "./ShallowWaterSolver";
import {WebGLEntity, VerticesType, TexCoordsType} from "./WebGLEntity";
import {seismic_colormap} from "./colormap";

const render_vertex_shader_src = require('./glsl/render_vertex.glsl');
const render_fragment_shader_src = require('./glsl/render.glsl');

class Renderer extends WebGLEntity {
    solver: ShallowWaterSolver;
    dot_size: number;
    dot_density: number;

    program: WebGLProgram;

    n_dots: number;
    n_verts_per_dot: number;
    
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
        this.dot_size = 0.002;
        this.dot_density = 0.1;

        this.setup();
    }

    setup() : void {
        const gl = this.solver.gl;
        const grid = this.solver.grid;

        gl.getExtension('OES_texture_float');
        gl.getExtension('OES_texture_float_linear');
        gl.getExtension('WEBGL_color_buffer_float');

        this.program = this._compileAndLinkShaders(gl, render_vertex_shader_src, render_fragment_shader_src);

        const n_coords_per_vert = 2;
        this.n_verts_per_dot = 6;

        const ndots_x = Math.floor(grid['nx'] * this.dot_density);
        const ndots_y = Math.floor(grid['ny'] * this.dot_density);
        this.n_dots = ndots_x * ndots_y;

        const render_verts = new Float32Array(this.n_dots * this.n_verts_per_dot * n_coords_per_vert);
        const render_offsets = new Float32Array(this.n_dots * this.n_verts_per_dot * n_coords_per_vert);
        const tex_coords = new Float32Array(this.n_dots * this.n_verts_per_dot * n_coords_per_vert);

        let ndot = 0
        for (let idx = 0; idx < ndots_x; idx++) {
            for (let jdy = 0; jdy < ndots_y; jdy++) {
                const dot_x = (idx + 0.5) / ndots_x * 2 - 1;
                const dot_y = (jdy + 0.5) / ndots_y * 2 - 1;
                const dot_index = ndot * this.n_verts_per_dot * n_coords_per_vert;

                render_verts[dot_index + 0 ] = dot_x; render_verts[dot_index + 1 ] = dot_y;
                render_verts[dot_index + 2 ] = dot_x; render_verts[dot_index + 3 ] = dot_y;
                render_verts[dot_index + 4 ] = dot_x; render_verts[dot_index + 5 ] = dot_y;
                render_verts[dot_index + 6 ] = dot_x; render_verts[dot_index + 7 ] = dot_y;
                render_verts[dot_index + 8 ] = dot_x; render_verts[dot_index + 9 ] = dot_y;
                render_verts[dot_index + 10] = dot_x; render_verts[dot_index + 11] = dot_y;

                render_offsets[dot_index + 0 ] = -1.0; render_offsets[dot_index + 1 ] = -1.0;
                render_offsets[dot_index + 2 ] = -1.0; render_offsets[dot_index + 3 ] = -1.0;
                render_offsets[dot_index + 4 ] = -1.0; render_offsets[dot_index + 5 ] =  1.0;
                render_offsets[dot_index + 6 ] =  1.0; render_offsets[dot_index + 7 ] = -1.0;
                render_offsets[dot_index + 8 ] =  1.0; render_offsets[dot_index + 9 ] =  1.0;
                render_offsets[dot_index + 10] =  1.0; render_offsets[dot_index + 11] =  1.0;

                tex_coords[dot_index + 0 ] = 0.0; tex_coords[dot_index + 1 ] = 0.0;
                tex_coords[dot_index + 2 ] = 0.0; tex_coords[dot_index + 3 ] = 0.0;
                tex_coords[dot_index + 4 ] = 0.0; tex_coords[dot_index + 5 ] = 1.0;
                tex_coords[dot_index + 6 ] = 1.0; tex_coords[dot_index + 7 ] = 0.0;
                tex_coords[dot_index + 8 ] = 1.0; tex_coords[dot_index + 9 ] = 1.0;
                tex_coords[dot_index + 10] = 1.0; tex_coords[dot_index + 11] = 1.0;

                ndot++;
            }
        }

        this.vertices = this._setupVertices(gl, this.program, render_verts, n_coords_per_vert, 'a_pos');
        this.offsets = this._setupVertices(gl, this.program, render_offsets, n_coords_per_vert, 'a_offset');
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
        gl.uniform1f(this.u_dot_size, this.dot_size);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.n_verts_per_dot * this.n_dots);
    }
}

export default Renderer;