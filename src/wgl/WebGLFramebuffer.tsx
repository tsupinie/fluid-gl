
import { WGLTexture } from "./WebGLTexture";

class WGLFramebufferBase {
    gl: WebGLRenderingContext;
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

    copyToTexture(texture: WGLTexture, x: number, y: number, width: number, height: number): void {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        texture.activate(0);

        gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, x, y, width, height, 0);
    }
}

class WGLScreenbuffer extends WGLFramebufferBase {
    constructor() {
        super();

        this.gl = null;
        this.framebuffer = null;
    }

    registerGLContext(gl: WebGLRenderingContext) {
        this.gl = gl;
    }
}

class WGLFramebuffer extends WGLFramebufferBase {
    texture: WGLTexture;

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

const flipFlopBuffers = (n_passes: number, source_fb: WGLFramebuffer, aux_fb: WGLFramebuffer[], 
                         do_render: (src: WGLFramebuffer, dest: WGLFramebuffer, ipass?: number) => void): WGLFramebuffer => {

    let fb1: WGLFramebuffer, fb2: WGLFramebuffer;

    for (let ipass = 0; ipass < n_passes; ipass++) {
        // fb1 is the source, and fb2 is the target for this pass
        [fb1, fb2] = ipass == 0 ? [source_fb, aux_fb[0]] : aux_fb;

        // Clear and unbind destination texture
        fb2.clear([0., 0., 0., 1.]);
        fb2.texture.deactivate();

        do_render(fb1, fb2, ipass);

        if (ipass > 0) {
            aux_fb.reverse();
        }
    }

    return fb2;
}

export {WGLFramebuffer, flipFlopBuffers};