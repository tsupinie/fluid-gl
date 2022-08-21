
class WGLBuffer {
    gl: WebGLRenderingContext;
    n_verts_per_entry: number;
    dtype: number;

    n_verts: number;
    draw_mode: number;

    buffer: WebGLBuffer;

    constructor(gl: WebGLRenderingContext, verts: Float32Array, n_verts_per_entry: number, draw_mode: number) {
        const DTYPES = {
            'Float32Array': gl.FLOAT,
            'Uint8Array': gl.UNSIGNED_BYTE,
        }

        this.gl = gl;
        this.n_verts_per_entry = n_verts_per_entry;
        this.dtype = DTYPES[verts.constructor.name];

        this.n_verts = verts.length / n_verts_per_entry;
        this.draw_mode = draw_mode;

        this.buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    }

    bindToProgram(prog_attr_location: number): void {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
        this.gl.enableVertexAttribArray(prog_attr_location);
        this.gl.vertexAttribPointer(prog_attr_location, this.n_verts_per_entry, this.dtype, false, 0, 0);
    }
}

export {WGLBuffer};