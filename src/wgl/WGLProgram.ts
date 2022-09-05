
import { WGLBuffer } from "./WGLBuffer";
import { WGLTexture } from "./WGLTexture";

/**
 * @module wgl/WebGLProgram
 * Module containing a helper class for WebGL programs
 */

/**
 * Compile and link a shader program
 * @param gl                - The WebGL rendering context
 * @param vertex_shader_src - The source code for the vertex shader
 * @param frag_shader_src   - The source code for the fragment shader
 * @returns                   A compiled and linked WebGL program
 */
const compileAndLinkShaders = (gl: WebGLRenderingContext, vertex_shader_src: string, frag_shader_src: string): WebGLProgram => {
    // create a vertex shader
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vertex_shader_src);
    gl.compileShader(vertexShader);

    const vertexCompiled = gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS);

    if (!vertexCompiled) {
        const compilationLog = gl.getShaderInfoLog(vertexShader);
        console.log('Vertex shader compiler log: ' + compilationLog);
    }
    
    // create a fragment shader
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, frag_shader_src);
    gl.compileShader(fragmentShader);

    const fragmentCompiled = gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS);

    if (!fragmentCompiled) {
        const compilationLog = gl.getShaderInfoLog(fragmentShader);
        console.log('Fragment shader compiler log: ' + compilationLog);
    }

    // link the two shaders into a WebGL program
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    const linked = gl.getProgramParameter(program, gl.LINK_STATUS);

    if (!linked) {
        const linkLog = gl.getProgramInfoLog(program);
        console.log('Linker log: ' + linkLog);
    }

    return program;
}

const UNIFORM_FUNCTION_TYPES = {
    'sampler2D': '1i',
    'int': '1i',
    'float': '1f',
    'vec2': '2fv',
    'vec3': '3fv',
    'vec4': '4fv',
}

/** Class representing a WebGL shader program */
class WGLProgram {
    /** @internal */
    gl: WebGLRenderingContext;

    /** @internal */
    prog: WebGLProgram;

    /** @internal */
    attributes: {
        [key: string]: {
            type: string;
            location: number;
        }
    }

    /** @internal */
    uniforms: {
        [key: string]: {
            type: string;
            location: WebGLUniformLocation;
        }
    }

    /** @internal */
    n_verts: number;

    /** @internal */
    draw_mode: number;

    /**
     * Create and compile a shader program from source
     * @param gl                  - The WebGL rendering context
     * @param vertex_shader_src   - The vertex shader source code
     * @param fragment_shader_src - The fragment shader source code
     */
    constructor(gl: WebGLRenderingContext, vertex_shader_src: string, fragment_shader_src: string) {
        this.gl = gl;
        this.prog = compileAndLinkShaders(gl, vertex_shader_src, fragment_shader_src);

        this.attributes = {};
        this.uniforms = {};

        this.n_verts = null;
        this.draw_mode = null;

        for (const match of vertex_shader_src.matchAll(/attribute +([\w ]+?) +([\w_]+);$/mg)) {
            const [full_match, type, a_name] = match;
            this.attributes[a_name] = {'type': type, 'location': gl.getAttribLocation(this.prog, a_name)};
        }

        for (const match of vertex_shader_src.matchAll(/uniform +([\w ]+?) +([\w_]+);$/mg)) {
            const [full_match, type, u_name] = match;
            const type_parts = type.split(' ');
            this.uniforms[u_name] = {'type': type_parts[type_parts.length - 1], 'location': gl.getUniformLocation(this.prog, u_name)};
        }

        for (const match of fragment_shader_src.matchAll(/uniform +([\w ]+?) +([\w_]+);$/mg)) {
            const [full_match, type, u_name] = match;
            const type_parts = type.split(' ');
            this.uniforms[u_name] = {'type': type_parts[type_parts.length - 1], 'location': gl.getUniformLocation(this.prog, u_name)};
        }
    }

    /**
     * Enable this program for rendering and optionally bind attribute, uniform, and texture values. This function should be called before calling 
     * {@link WGLProgram.bindAttributes}, {@link WGLProgram.setUniforms}, or {@link WGLProgram.bindTextures} on a given rendering pass.
     * @param attribute_buffers - An object with the keys being the attribute variable names and the values being the buffers to associate with each variable
     * @param uniform_values    - An object with the keys being the uniform variable names and the values being the uniform values
     * @param textures          - An object with the keys being the sampler names in the source code and the values being the textures to associate with each sampler
     */
    use(attribute_buffers?: {[key: string]: WGLBuffer}, uniform_values?: {[key: string]: (number | number[])}, textures?: {[key: string]: WGLTexture}): void {
        this.gl.useProgram(this.prog);
        
        this.draw_mode = null;
        this.n_verts = null;

        if (attribute_buffers !== undefined) {
            this.bindAttributes(attribute_buffers);
        }

        if (uniform_values !== undefined) {
            this.setUniforms(uniform_values);
        }

        if (textures !== undefined) {
            this.bindTextures(textures);
        }
    }

    /**
     * Bind attribute buffers to variables in this shader program. When rendring, call {@link WGLProgram.use} before calling this function.
     * @param attribute_buffers - An object with the keys being the attribute variable names and the values being the buffers to associate with each variable
     */
    bindAttributes(attribute_buffers: {[key: string]: WGLBuffer}): void {
        Object.entries(attribute_buffers).forEach(([a_name, buffer]) => {
            this.n_verts = this.n_verts === null ? buffer.n_verts : this.n_verts;
            this.draw_mode = this.draw_mode === null ? buffer.draw_mode : this.draw_mode;

            if (this.draw_mode != buffer.draw_mode || this.n_verts != buffer.n_verts) {
                throw `Unexpected draw mode or number of vertices.`;
            }

            const {type, location} = this.attributes[a_name];
            buffer.bindToProgram(location);
        });
    }

    /**
     * Set uniform values in this shader program. When rendering, all {@link WGLProgram.use} before calling this function.
     * @param uniform_values - An object with the keys being the uniform variable names and the values being the uniform values
     */
    setUniforms(uniform_values: {[key: string]: (number | number[])}): void {
        Object.entries(uniform_values).forEach(([u_name, value]) => {
            const {type, location} = this.uniforms[u_name];
            this.gl['uniform' + UNIFORM_FUNCTION_TYPES[type]](location, value);
        });
    }

    /**
     * Bind textures to samplers in this shader program. When rendring, call {@link WGLProgram.use} before calling this function.
     * @param textures - An object with the keys being the sampler names in the source code and the values being the textures to associate with each sampler
     */
    bindTextures(textures: {[key: string]: WGLTexture}) {
        Object.entries(textures).forEach(([sampler_name, texture], gl_tex_num) => {
            texture.bindToProgram(this.uniforms[sampler_name]['location'], gl_tex_num);
        });
    }

    /**
     * Run this shader program.
     */
    draw(): void {
        this.gl.drawArrays(this.draw_mode, 0, this.n_verts);
    }
}

export {WGLProgram};