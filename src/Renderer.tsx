
import {ShallowWaterSolver} from "./ShallowWaterSolver";
import {colormaps} from "./colormap";
import { WGLBuffer } from "./wgl/WebGLBuffer";
import { WGLProgram } from "./wgl/WebGLProgram";
import { WGLTexture } from "./wgl/WebGLTexture";
import { WGLFramebuffer } from "./wgl/WebGLFramebuffer";

const render_vertex_shader_src = require('./glsl/render_vertex.glsl');
const render_fragment_shader_src = require('./glsl/render.glsl');

const colormap = 'piyg';

class Renderer {
    solver: ShallowWaterSolver;
    dot_size: number;
    dot_density: number;

    program: WGLProgram;

    n_dots: number;
    n_verts_per_dot: number;
    
    vertices: WGLBuffer;
    offsets: WGLBuffer;
    texcoords: WGLBuffer;
    cmap_texture: WGLTexture;

    constructor(solver: ShallowWaterSolver) {
        this.solver = solver;
        this.dot_size = 0.002;
        this.dot_density = 0.15;

        this.setup();
    }

    setup() : void {
        const gl = this.solver.gl;
        const grid = this.solver.grid;

        gl.getExtension('OES_texture_float');
        gl.getExtension('OES_texture_float_linear');
        gl.getExtension('WEBGL_color_buffer_float');

        // Compile shader program
        this.program = new WGLProgram(gl, render_vertex_shader_src, render_fragment_shader_src);

        // Setup the coordinates for all the dots
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

        // Setup attribute and texture coordinate buffers
        this.vertices = new WGLBuffer(gl, render_verts, n_coords_per_vert);
        this.offsets = new WGLBuffer(gl, render_offsets, n_coords_per_vert);
        this.texcoords = new WGLBuffer(gl, tex_coords, 2);

        // Setup the texture for the height colormap
        const cmap_image = {'format': gl.RGBA, 'type': gl.UNSIGNED_BYTE, 'image': colormaps[colormap].getImage(), 'mag_filter': gl.LINEAR};
        this.cmap_texture = new WGLTexture(gl, cmap_image);
    }

    render() : void {
        const gl = this.solver.gl;
        const grid = this.solver.grid;

        this.program.use(
            {'a_pos': this.vertices, 'a_offset': this.offsets, 'a_tex_coord': this.texcoords},
            {'u_aspect': grid['nx'] / grid['ny'], 'u_unit': [1 / grid['nx'], 1 / grid['ny']], 'u_dot_size': this.dot_size},
            {'u_sampler': this.solver.getStateTexture(), 'u_colormap_sampler': this.cmap_texture}
        );

        WGLFramebuffer.screen.renderTo(0, 0, (grid['nx'] - 1) * 2, (grid['ny'] - 1) * 2);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.n_verts_per_dot * this.n_dots);
    }
}

export default Renderer;