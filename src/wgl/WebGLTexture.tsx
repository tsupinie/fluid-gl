
interface WGLTextureSpec {
    format: number;
    type: number;
    width?: number;
    height?: number;
    mag_filter?: number;
    image: any;
}

class WGLTexture {
    gl: WebGLRenderingContext;
    texture: WebGLTexture;
    tex_num: number;

    constructor(gl: WebGLRenderingContext, image: WGLTextureSpec) {
        this.gl = gl;

        this.texture = gl.createTexture();
        this.tex_num = null;

        this.setImageData(image);

        const mag_filter = image['mag_filter'] === undefined ? gl.LINEAR : image['mag_filter'];

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mag_filter);
    }

    setImageData(image: WGLTextureSpec): void {
        const gl = this.gl;

        gl.bindTexture(gl.TEXTURE_2D, this.texture);

        if ('width' in image && 'height' in image) {
            gl.texImage2D(gl.TEXTURE_2D, 0, image['format'], image['width'], image['height'], 0, 
                image['format'], image['type'], image['image']);
        }
        else {
            gl.texImage2D(gl.TEXTURE_2D, 0, image['format'], 
                image['format'], image['type'], image['image']);
        }
    }

    bindToProgram(prog_uni_location: WebGLUniformLocation, gl_tex_num: number): void {
        this.activate(gl_tex_num);
        this.gl.uniform1i(prog_uni_location, gl_tex_num);
    }

    activate(gl_tex_num: number): void {
        this.tex_num = gl_tex_num;
        this.gl.activeTexture(this.gl['TEXTURE' + gl_tex_num]);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    }

    deactivate(): void {
        if (this.tex_num === null) {
            return;
        }

        this.gl.activeTexture(this.gl['TEXTURE' + this.tex_num]);
        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
        this.tex_num = null;
    }

    delete(): void {
        this.gl.deleteTexture(this.texture);
        this.tex_num = null;
    }
}

export {WGLTexture, WGLTextureSpec};