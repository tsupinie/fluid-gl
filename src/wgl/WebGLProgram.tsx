
import { WGLBuffer } from "./WebGLBuffer";
import { WGLTexture } from "./WebGLTexture";

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
    'highp float': '1f',
    'highp vec2': '2fv',
    'highp vec3': '3fv',
    'highp vec4': '4fv',
}

class WGLProgram {
    gl: WebGLRenderingContext;
    prog: WebGLProgram;

    attributes: {
        [key: string]: {
            type: string;
            location: number;
        }
    }
    uniforms: {
        [key: string]: {
            type: string;
            location: WebGLUniformLocation;
        }
    }

    constructor(gl: WebGLRenderingContext, vertex_shader_src: string, fragment_shader_src: string) {
        this.gl = gl;
        this.prog = compileAndLinkShaders(gl, vertex_shader_src, fragment_shader_src);

        this.attributes = {};
        this.uniforms = {};

        for (const match of vertex_shader_src.matchAll(/attribute +([\w ]+?) +([\w_]+);$/mg)) {
            const [full_match, type, a_name] = match;
            this.attributes[a_name] = {'type': type, 'location': gl.getAttribLocation(this.prog, a_name)};
        }

        for (const match of vertex_shader_src.matchAll(/uniform +([\w ]+?) +([\w_]+);$/mg)) {
            const [full_match, type, u_name] = match;
            this.uniforms[u_name] = {'type': type, 'location': gl.getUniformLocation(this.prog, u_name)};
        }

        for (const match of fragment_shader_src.matchAll(/uniform +([\w ]+?) +([\w_]+);$/mg)) {
            const [full_match, type, u_name] = match;
            this.uniforms[u_name] = {'type': type, 'location': gl.getUniformLocation(this.prog, u_name)};
        }
    }

    use(attribute_buffers?: {[key: string]: WGLBuffer}, uniform_values?: {[key: string]: (number | number[])}, textures?: {[key: string]: WGLTexture}): void {
        this.gl.useProgram(this.prog);

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

    bindAttributes(attribute_buffers: {[key: string]: WGLBuffer}): void {
        Object.entries(attribute_buffers).forEach(([a_name, buffer]) => {
            const {type, location} = this.attributes[a_name];
            buffer.bindToProgram(location);
        });
    }

    setUniforms(uniform_values: {[key: string]: (number | number[])}): void {
        Object.entries(uniform_values).forEach(([u_name, value]) => {
            const {type, location} = this.uniforms[u_name];
            this.gl['uniform' + UNIFORM_FUNCTION_TYPES[type]](location, value);
        });
    }

    bindTextures(textures: {[key: string]: WGLTexture}) {
        Object.entries(textures).forEach(([sampler_name, texture], gl_tex_num) => {
            texture.bindToProgram(this.uniforms[sampler_name]['location'], gl_tex_num);
        });
    }
}

export {WGLProgram};