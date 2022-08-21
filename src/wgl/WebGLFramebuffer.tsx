
import { WGLTexture } from "./WebGLTexture";

class WGLFramebuffer {
    gl: WebGLRenderingContext;
    texture: WGLTexture;
    framebuffer: WebGLFramebuffer;

    constructor(gl: WebGLRenderingContext, texture: WGLTexture) {
        if (WGLFramebuffer.gl === null) {
            WGLFramebuffer.gl = gl;
        }

        this.texture = texture
        this.framebuffer = gl.createFramebuffer();

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture['texture'], 0);
    }

    clear(color: [number, number, number, number]): void {
        const gl = WGLFramebuffer.gl;
        gl.clearColor(...color);
        this.renderTo();
        gl.clear(gl.COLOR_BUFFER_BIT);
    }

    renderTo(): void {
        const gl = WGLFramebuffer.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    }

    static gl: WebGLRenderingContext = null;

    static renderToScreen(): void {
        const gl = WGLFramebuffer.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
}

export {WGLFramebuffer};