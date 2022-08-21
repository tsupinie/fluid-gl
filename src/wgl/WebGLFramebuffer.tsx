
import { WGLTexture } from "./WebGLTexture";

class WGLFramebufferBase {
    gl: WebGLRenderingContext;
    texture: WGLTexture;
    framebuffer: WebGLFramebuffer;

    clear(color: [number, number, number, number]): void {
        const gl = this.gl;
        gl.clearColor(...color);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }

    renderTo(x: number, y: number, width: number, height: number): void {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.viewport(x, y, width, height);
    }
}

class WGLScreenbuffer extends WGLFramebufferBase {
    constructor() {
        super();

        this.gl = null;

        this.texture = null;
        this.framebuffer = null;
    }

    registerGLContext(gl: WebGLRenderingContext) {
        this.gl = gl;
    }
}

class WGLFramebuffer extends WGLFramebufferBase {
    constructor(gl: WebGLRenderingContext, texture: WGLTexture) {
        super();

        this.gl = gl;

        this.texture = texture
        this.framebuffer = gl.createFramebuffer();

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture['texture'], 0);
    }

    static screen: WGLScreenbuffer = new WGLScreenbuffer();
}

export {WGLFramebuffer};