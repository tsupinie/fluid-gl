
import WebGLEntity from "./WebGLEntity.js";

class ShallowWaterSolver extends WebGLEntity {
    constructor(initial_state) {
        super();

        this.state = initial_state;

        this.is_initialized = false;
    }

    setup(gl) {
        gl.getExtension('OES_texture_float');
        gl.getExtension('OES_texture_float_linear');
        gl.getExtension('WEBGL_color_buffer_float');

        const vertex_shader_src = `
        attribute vec2 a_pos;
        attribute vec2 a_tex_coord;

        varying highp vec2 v_tex_coord;

        void main() {
            gl_Position = vec4(a_pos, 0., 1.);

            v_tex_coord = a_tex_coord;
        }
        `;

        const inject_fragment_shader_src = `
        uniform sampler2D u_sampler_new;
        uniform sampler2D u_sampler_cur;

        varying highp vec2 v_tex_coord;

        void main() {
            highp vec3 tex_new = texture2D(u_sampler_new, v_tex_coord).rgb;
            highp vec3 tex_cur = texture2D(u_sampler_cur, v_tex_coord).rgb;
            gl_FragColor = vec4(tex_new + tex_cur, 1.);
        }
        `;

        const fragment_shader_src = `
        uniform sampler2D u_stage0_sampler;
        uniform sampler2D u_stage1_sampler;

        uniform highp vec2 u_unit;
        uniform highp float u_dx;
        uniform highp float u_dt;
        uniform int u_istage;

        varying highp vec2 v_tex_coord;

        void main() {
            highp vec2 ihat = vec2(u_unit.x, 0.);
            highp vec2 jhat = vec2(0., u_unit.y);

            highp vec3 tex, tex_ip1, tex_im1, tex_jp1, tex_jm1;
            highp vec2 wind, wind_ip1, wind_im1, wind_jp1, wind_jm1;
            highp float hght, hght_ip1, hght_im1, hght_jp1, hght_jm1;

            if (u_istage == 0) {
                tex = texture2D(u_stage0_sampler, v_tex_coord).rgb;
                tex_ip1 = texture2D(u_stage0_sampler, v_tex_coord + ihat).rgb;
                tex_im1 = texture2D(u_stage0_sampler, v_tex_coord - ihat).rgb;
                tex_jp1 = texture2D(u_stage0_sampler, v_tex_coord + jhat).rgb;
                tex_jm1 = texture2D(u_stage0_sampler, v_tex_coord - jhat).rgb;
            }
            else if (u_istage == 1) {
                tex = texture2D(u_stage1_sampler, v_tex_coord).rgb;
                tex_ip1 = texture2D(u_stage1_sampler, v_tex_coord + ihat).rgb;
                tex_im1 = texture2D(u_stage1_sampler, v_tex_coord - ihat).rgb;
                tex_jp1 = texture2D(u_stage1_sampler, v_tex_coord + jhat).rgb;
                tex_jm1 = texture2D(u_stage1_sampler, v_tex_coord - jhat).rgb;
            }

            hght = tex.r;
            hght_ip1 = tex_ip1.r; hght_im1 = tex_im1.r; hght_jp1 = tex_jp1.r; hght_jm1 = tex_jm1.r;

            wind = tex.gb;
            wind_ip1 = tex_ip1.gb; wind_im1 = tex_im1.gb; wind_jp1 = tex_jp1.gb; wind_jm1 = tex_jm1.gb;

            highp float dz_dx = (hght_ip1 - hght_im1) / (2. * u_dx);
            highp float dz_dy = (hght_jp1 - hght_jm1) / (2. * u_dx);

            highp vec2 dwind_dx = (wind_ip1 - wind_im1) / (2. * u_dx);
            highp vec2 dwind_dy = (wind_jp1 - wind_jm1) / (2. * u_dx);
            highp vec2 d2wind_dx2 = (wind_ip1 - 2. * wind + wind_im1) / (4. * u_dx * u_dx);
            highp vec2 d2wind_dy2 = (wind_jp1 - 2. * wind + wind_jm1) / (4. * u_dx * u_dx);

            // Apply Neumann BC for height
            if (v_tex_coord.x - ihat.x < 0. || v_tex_coord.x + ihat.x > 1.) {
                dz_dx = 0.;
            }
            if (v_tex_coord.y - jhat.y < 0. || v_tex_coord.y + jhat.y > 1.) {
                dz_dy = 0.;
            }

            highp vec3 dtex_dt = vec3(0., 0., 0.);

            highp float mean_depth = 2.;
            highp float kinematic_viscosity = 5e-2;

            dtex_dt.r = -((mean_depth + hght) * dwind_dx.x + wind.x * dz_dx + (mean_depth + hght) * dwind_dy.y + wind.y * dz_dy);
            dtex_dt.gb = -9.806 * vec2(dz_dx, dz_dy) - wind.x * dwind_dx - wind.y * dwind_dy + kinematic_viscosity * (d2wind_dx2 + d2wind_dy2);

            if (u_istage == 0) {
                highp vec3 out_tex = tex + u_dt * dtex_dt;
                gl_FragColor = vec4(out_tex, 1.);
            }
            else if (u_istage == 1) {
                highp vec3 tex_stage0 = texture2D(u_stage0_sampler, v_tex_coord).rgb;
                highp vec3 out_tex = 0.5 * ((tex_stage0 + tex) + u_dt * dtex_dt);

                // Apply impermeability condition for u and v
                if (v_tex_coord.x - ihat.x < 0. || v_tex_coord.x + ihat.x > 1.) {
                    out_tex.g = 0.;
                }
                if (v_tex_coord.y - jhat.y < 0. || v_tex_coord.y + jhat.y > 1.) {
                    out_tex.b = 0.;
                }
    
                gl_FragColor = vec4(out_tex, 1.);
            }
        }
        `;

        const render_fragment_shader_src = `
        uniform sampler2D u_sampler;

        varying highp vec2 v_tex_coord;

        void main() {
            highp vec3 tex = texture2D(u_sampler, v_tex_coord).rgb;
            gl_FragColor = vec4(sqrt(sqrt(abs(tex))), 1.);
        }
        `;

        this.inject_program = this._compileAndLinkShaders(gl, vertex_shader_src, inject_fragment_shader_src);
        this.program = this._compileAndLinkShaders(gl, vertex_shader_src, fragment_shader_src);
        this.render_program = this._compileAndLinkShaders(gl, vertex_shader_src, render_fragment_shader_src);

        this.verts = new Float32Array([-1.0, 1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0]);
        this.tex_coords = new Float32Array([0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0]);

        this.inject_vertices = this._setupVertices(gl, this.inject_program, this.verts, 2, 'a_pos');
        this.vertices = this._setupVertices(gl, this.program, this.verts, 2, 'a_pos');
        this.render_vertices = this._setupVertices(gl, this.render_program, this.verts, 2, 'a_pos');

        this.texcoords = this._setupVertices(gl, this.program, this.tex_coords, 2, 'a_tex_coord');
        this.render_texcoords = this._setupVertices(gl, this.render_program, this.tex_coords, 2, 'a_tex_coord');

        this.render_u_sampler = gl.getUniformLocation(this.render_program, 'u_sampler');

        // Set up model state textures and framebuffers
        this.u_unit = gl.getUniformLocation(this.program, 'u_unit');
        this.u_dx = gl.getUniformLocation(this.program, 'u_dx');
        this.u_dt = gl.getUniformLocation(this.program, 'u_dt');
        this.u_istage = gl.getUniformLocation(this.program, 'u_istage');

        const state_img = {
            'format': gl.RGBA, 'type': gl.FLOAT, 
            'width': this.state['nx'], 'height': this.state['ny'], 'image': null,
            'mag_filter': gl.LINEAR
        }

        const n_stages = 2;
        this.stages = [];

        for (let istg = 0; istg < n_stages + 1; istg++) {
            const sampler = gl.getUniformLocation(this.program, `u_stage${istg}_sampler`);
            const framebuffer = gl.createFramebuffer();
            const texture = this._setupTexture(gl, state_img);
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture['texture'], 0);

            this.stages.push({'framebuffer': framebuffer, 'texture': texture, 'sampler': sampler});
        }

        this.inject_framebuffer = gl.createFramebuffer();
        this.inject_texture = this._setupTexture(gl, state_img);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.inject_framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.inject_texture['texture'], 0);

        this.inject_state_texture = {
            'uniforms': {'u_sampler_cur': gl.getUniformLocation(this.inject_program, 'u_sampler_cur')},
            'texture': this.stages[0]['texture']['texture'],
        };

        this.is_initialized = true;
    }

    inject_state(gl, state, clear_state) {
        clear_state = clear_state === undefined ? false : clear_state;

        if (state['nx'] != this.state['nx'] || state['ny'] != this.state['ny']) {
            throw `State dimension mismatch. Expected (${this.state['nx']}, ${this.state['ny']}), received (${state['nx']}, ${state['hy']})`;
        }

        if (state['z'].length != state['nx'] * state['ny']) {
            throw `State dimensions (${state['nx']}, ${state['ny']}) and data length ${state['z'].length} do not match`;
        }
        
        // Set up texture for new state
        const img_data = new Float32Array(state['z'].length * 4);
        for (let idx = 0; idx < state['z'].length; idx++) {
            img_data[4 * idx + 0] = state['z'][idx];
            img_data[4 * idx + 1] = state['u'][idx];
            img_data[4 * idx + 2] = state['v'][idx];
            img_data[4 * idx + 3] = 0.;
        }

        const state_img = {
            'format': gl.RGBA, 'type': gl.FLOAT, 
            'width': this.state['nx'], 'height': this.state['ny'], 'image': img_data,
            'mag_filter': gl.LINEAR
        }

        const texture = this._setupTexture(gl, state_img, this.inject_program, 'u_sampler_new', this.tex_coords, 'a_tex_coord');  

        // Combine the current state and new texture into the injection framebuffer
        gl.useProgram(this.inject_program);

        if (clear_state) {
            // If we want to clear first, clear the main state buffer
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.stages[0]['framebuffer']);
            gl.clearColor(0., 0., 0., 1.);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.inject_framebuffer);
        gl.viewport(0, 0, this.state['nx'], this.state['ny']);

        this._bindVertices(gl, this.inject_vertices);
        this._bindTexture(gl, 0, texture);
        this._bindTexture(gl, 1, this.inject_state_texture);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        
        // Now copy the injection framebuffer back into the main state
        this._bindTexture(gl, 0, this.inject_state_texture);
        gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, this.state['nx'], this.state['ny'], 0);

        // Delete injected state texture
        gl.deleteTexture(texture['texture']);
        gl.deleteBuffer(texture['tex_coord']);
    }

    advance(gl, dt) {
        if (!this.is_initialized) return;

        gl.useProgram(this.program);
        gl.viewport(0, 0, this.state['nx'], this.state['ny']);

        this._bindVertices(gl, this.vertices);
        this._bindVertices(gl, this.texcoords);

        gl.uniform2f(this.u_unit, 1 / this.state['nx'], 1 / this.state['ny']);
        gl.uniform1f(this.u_dx, this.state['dx']);
        gl.uniform1f(this.u_dt, dt);

        // Clear all intermediate buffers
        gl.clearColor(0., 0., 0., 1.);
        for (let istg = 1; istg < this.stages.length; istg++) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.stages[istg]['framebuffer']);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }

        // Unbind previous textures
        for (let istg = 0; istg < this.stages.length - 1; istg++) {
            gl.activeTexture(gl['TEXTURE' + istg]);
            gl.bindTexture(gl.TEXTURE_2D, null);
        }

        // Advance model state
        for (let istg = 0; istg < this.stages.length - 1; istg++) {
            gl.uniform1i(this.stages[istg]['sampler'], istg);
            this._bindTexture(gl, istg, this.stages[istg]['texture']);

            gl.bindFramebuffer(gl.FRAMEBUFFER, this.stages[istg + 1]['framebuffer']);
            gl.uniform1i(this.u_istage, istg);

            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }

        // Copy post state back to main state framebuffer
        this._bindTexture(gl, 0, this.stages[0]['texture']);
        gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, this.state['nx'], this.state['ny'], 0);

    }

    render(gl) {
        if (!this.is_initialized) return;

        gl.useProgram(this.render_program);
        gl.viewport(0, 0, this.state['nx'] * 2, this.state['ny'] * 2);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        this._bindVertices(gl, this.render_vertices);
        this._bindVertices(gl, this.render_texcoords);
        this._bindTexture(gl, 0, this.stages[0]['texture'], false);
        gl.uniform1i(this.render_u_sampler, 0);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
}

export default ShallowWaterSolver;