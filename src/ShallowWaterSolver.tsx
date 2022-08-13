
import {WebGLEntity, VerticesType, TexCoordsType} from "./WebGLEntity";

interface GridType {
    nx: number;
    ny: number;
    dx: number;
}

interface ShallowWaterStateType {
    u: Float32Array;
    v: Float32Array;
    z: Float32Array;
}

interface StateFramebufferType {
    framebuffer: WebGLFramebuffer;
    texture: TexCoordsType;
    sampler: WebGLUniformLocation;
}

class ShallowWaterSolver extends WebGLEntity {
    grid: GridType;
    state: ShallowWaterStateType;
    is_initialized: boolean;

    verts: Float32Array;
    tex_coords: Float32Array;

    program: WebGLProgram;
    inject_program: WebGLProgram;
    render_program: WebGLProgram;

    vertices: VerticesType;
    inject_vertices: VerticesType;
    render_vertices: VerticesType;
    texcoords: VerticesType;
    render_texcoords: VerticesType;

    render_u_sampler: WebGLUniformLocation;
    u_unit: WebGLUniformLocation;
    u_dx: WebGLUniformLocation;
    u_dt: WebGLUniformLocation;
    u_istage: WebGLUniformLocation;

    stages: StateFramebufferType[];
    inject_state_fb: StateFramebufferType;

    constructor(grid: GridType, initial_state: ShallowWaterStateType) {
        super();

        this.grid = grid;
        this.state = initial_state;

        this.is_initialized = false;
    }

    setup(gl: WebGLRenderingContext) {
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
        uniform sampler2D u_stage2_sampler;

        uniform highp vec2 u_unit;
        uniform highp float u_dx;
        uniform highp float u_dt;
        uniform int u_istage;

        varying highp vec2 v_tex_coord;

        // Constants
        highp float mean_depth = 5.;
        highp float kinematic_viscosity = 1e-2; // 2.7e-1 does interesting things
        highp float inv_turb_prandtl = 3.; // 0. to turn off height diffusion

        void main() {
            highp vec2 ihat = vec2(u_unit.x, 0.);
            highp vec2 jhat = vec2(0., u_unit.y);

            highp vec3 tex, tex_ip1, tex_jp1, tex_im1, tex_jm1, tex_ip1half, tex_im1half, tex_jp1half, tex_jm1half, tex_ip1_jm1half, tex_im1half_jp1;
            highp vec2 wind, wind_ip1, wind_jp1, wind_im1, wind_jm1, wind_ip1half, wind_im1half, wind_jp1half, wind_jm1half;
            highp float u_ip1_jm1half, v_im1half_jp1;
            highp float hght, hght_ip1, hght_jp1, hght_im1, hght_jm1, hght_ip1half, hght_im1half, hght_jp1half, hght_jm1half;

            //  Arakawa C grid structure:
            //
            //    v_j+1 |    v
            //          |
            //  z_j u_j u    z    u
            //          |
            //      v_j *----v-----
            //         u_i  z_i   u_i+1
            //              v_i 
            //
            // u_i+1/2,j and v_i,j+1/2 are the velocity components defined at scalar points
            // u_i,j-1/2, u_i+1,j-1/2, v_i-1/2,j and v_i+1/2,j are needed for v momentum advection by u wind
            // v_i-1/2,j, v_i-1/2,j+1, u_i,j-1/2 and u_i,j+1/2 are needed for u momentum advection by v wind
            // z_i-1/2,j z_i+1/2,j, z_i,j-1/2, and z_i,j+1/2 are the scalars defined at the velocity points

            if (u_istage == 0) {
                tex = texture2D(u_stage0_sampler, v_tex_coord).rgb;
                tex_ip1half = texture2D(u_stage0_sampler, v_tex_coord + 0.5 * ihat).rgb;
                tex_im1half = texture2D(u_stage0_sampler, v_tex_coord - 0.5 * ihat).rgb;
                tex_jp1half = texture2D(u_stage0_sampler, v_tex_coord + 0.5 * jhat).rgb;
                tex_jm1half = texture2D(u_stage0_sampler, v_tex_coord - 0.5 * jhat).rgb;
                tex_ip1_jm1half = texture2D(u_stage0_sampler, v_tex_coord + ihat - 0.5 * jhat).rgb;
                tex_im1half_jp1 = texture2D(u_stage0_sampler, v_tex_coord - 0.5 * ihat + jhat).rgb;
                tex_ip1 = texture2D(u_stage0_sampler, v_tex_coord + ihat).rgb;
                tex_jp1 = texture2D(u_stage0_sampler, v_tex_coord + jhat).rgb;
                tex_im1 = texture2D(u_stage0_sampler, v_tex_coord - ihat).rgb;
                tex_jm1 = texture2D(u_stage0_sampler, v_tex_coord - jhat).rgb;
            }
            else if (u_istage == 1) {
                tex = texture2D(u_stage1_sampler, v_tex_coord).rgb;
                tex_ip1half = texture2D(u_stage1_sampler, v_tex_coord + 0.5 * ihat).rgb;
                tex_im1half = texture2D(u_stage1_sampler, v_tex_coord - 0.5 * ihat).rgb;
                tex_jp1half = texture2D(u_stage1_sampler, v_tex_coord + 0.5 * jhat).rgb;
                tex_jm1half = texture2D(u_stage1_sampler, v_tex_coord - 0.5 * jhat).rgb;
                tex_ip1_jm1half = texture2D(u_stage1_sampler, v_tex_coord + ihat - 0.5 * jhat).rgb;
                tex_im1half_jp1 = texture2D(u_stage1_sampler, v_tex_coord - 0.5 * ihat + jhat).rgb;
                tex_ip1 = texture2D(u_stage1_sampler, v_tex_coord + ihat).rgb;
                tex_jp1 = texture2D(u_stage1_sampler, v_tex_coord + jhat).rgb;
                tex_im1 = texture2D(u_stage1_sampler, v_tex_coord - ihat).rgb;
                tex_jm1 = texture2D(u_stage1_sampler, v_tex_coord - jhat).rgb;
            }
            else if (u_istage == 2) {
                tex = texture2D(u_stage2_sampler, v_tex_coord).rgb;
                tex_ip1half = texture2D(u_stage2_sampler, v_tex_coord + 0.5 * ihat).rgb;
                tex_im1half = texture2D(u_stage2_sampler, v_tex_coord - 0.5 * ihat).rgb;
                tex_jp1half = texture2D(u_stage2_sampler, v_tex_coord + 0.5 * jhat).rgb;
                tex_jm1half = texture2D(u_stage2_sampler, v_tex_coord - 0.5 * jhat).rgb;
                tex_ip1_jm1half = texture2D(u_stage2_sampler, v_tex_coord + ihat - 0.5 * jhat).rgb;
                tex_im1half_jp1 = texture2D(u_stage2_sampler, v_tex_coord - 0.5 * ihat + jhat).rgb;
                tex_ip1 = texture2D(u_stage2_sampler, v_tex_coord + ihat).rgb;
                tex_jp1 = texture2D(u_stage2_sampler, v_tex_coord + jhat).rgb;
                tex_im1 = texture2D(u_stage2_sampler, v_tex_coord - ihat).rgb;
                tex_jm1 = texture2D(u_stage2_sampler, v_tex_coord - jhat).rgb;
            }

            hght = tex.r;
            hght_ip1half = tex_ip1half.r; hght_im1half = tex_im1half.r; hght_jp1half = tex_jp1half.r; hght_jm1half = tex_jm1half.r;
            hght_ip1 = tex_ip1.r; hght_jp1 = tex_jp1.r; hght_im1 = tex_im1.r; hght_jm1 = tex_jm1.r;

            wind = tex.gb;
            wind_ip1half = tex_ip1half.gb; wind_im1half = tex_im1half.gb; wind_jp1half = tex_jp1half.gb; wind_jm1half = tex_jm1half.gb;
            wind_ip1 = tex_ip1.gb; wind_jp1 = tex_jp1.gb; wind_im1 = tex_im1.gb; wind_jm1 = tex_jm1.gb;
            u_ip1_jm1half = tex_ip1_jm1half.g; v_im1half_jp1 = tex_im1half_jp1.b;

            // Finite differences
            highp float dz_dx = (hght - hght_im1) / u_dx;     // Defined at u point
            highp float dz_dy = (hght - hght_jm1) / u_dx;     // Defined at v point
            highp float du_dx = (wind_ip1.x - wind.x) / u_dx; // Defined at scalar point
            highp float dv_dy = (wind_jp1.y - wind.y) / u_dx; // Defined at scalar point

            // 2nd order advection
            highp float dz_flux_dx = wind_ip1.x * hght_ip1half / u_dx - wind.x * hght_im1half / u_dx;
            highp float dz_flux_dy = wind_jp1.y * hght_jp1half / u_dx - wind.y * hght_jm1half / u_dx;
            highp float du_flux_dx = wind_ip1half.x * wind_ip1half.x / u_dx - wind_im1half.x * wind_im1half.x / u_dx;
            highp float du_flux_dy = v_im1half_jp1 * wind_jp1half.x / u_dx - wind_im1half.y * wind_jm1half.x / u_dx;
            highp float dv_flux_dx = u_ip1_jm1half * wind_ip1half.y / u_dx - wind_jm1half.x * wind_jm1half.y / u_dx;
            highp float dv_flux_dy = wind_jp1half.y * wind_jp1half.y / u_dx - wind_jm1half.y * wind_jm1half.y / u_dx;
            highp vec2 dwind_flux_dx = vec2(du_flux_dx, dv_flux_dx);
            highp vec2 dwind_flux_dy = vec2(du_flux_dy, dv_flux_dy);

            // 2nd order diffusion
            highp float d2z_dx2 = (hght_ip1 - 2. * hght + hght_im1) / (u_dx * u_dx);
            highp float d2z_dy2 = (hght_jp1 - 2. * hght + hght_jm1) / (u_dx * u_dx);
            highp vec2 d2wind_dx2 = (wind_ip1 - 2. * wind + wind_im1) / (u_dx * u_dx);
            highp vec2 d2wind_dy2 = (wind_jp1 - 2. * wind + wind_jm1) / (u_dx * u_dx);

            // Apply Neumann BC for height
            if (v_tex_coord.x - ihat.x < 0. || v_tex_coord.x + 2. * ihat.x > 1.) {
                dz_flux_dx = 0.;
            }
            if (v_tex_coord.y - jhat.y < 0. || v_tex_coord.y + 2. * jhat.y > 1.) {
                dz_flux_dy = 0.;
            }

            highp vec3 dtex_dt = vec3(0., 0., 0.);

            dtex_dt.r = -(mean_depth + hght) * (du_dx + dv_dy) - dz_flux_dx - dz_flux_dy + inv_turb_prandtl * kinematic_viscosity * (d2z_dx2 + d2z_dy2);
            dtex_dt.gb = -9.806 * vec2(dz_dx, dz_dy) - dwind_flux_dx - dwind_flux_dy + kinematic_viscosity * (d2wind_dx2 + d2wind_dy2);

            if (u_istage == 0) {
                highp vec3 out_tex = tex + u_dt / 3. * dtex_dt;
                gl_FragColor = vec4(out_tex, 1.);
            }
            else if (u_istage == 1) {
                highp vec3 tex_stage0 = texture2D(u_stage0_sampler, v_tex_coord).rgb;
                highp vec3 out_tex = tex_stage0 + 0.5 * u_dt * dtex_dt;
    
                gl_FragColor = vec4(out_tex, 1.);
            }
            else if (u_istage == 2) {
                highp vec3 tex_stage0 = texture2D(u_stage0_sampler, v_tex_coord).rgb;
                highp vec3 out_tex = tex_stage0 + u_dt * dtex_dt;

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
            'width': this.grid['nx'], 'height': this.grid['ny'], 'image': null,
            'mag_filter': gl.LINEAR
        }

        const n_stages = 3;
        this.stages = [];

        for (let istg = 0; istg < n_stages + 1; istg++) {
            const sampler = gl.getUniformLocation(this.program, `u_stage${istg}_sampler`);
            const framebuffer = gl.createFramebuffer();
            const texture = this._setupTexture(gl, state_img);
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture['texture'], 0);

            this.stages.push({'framebuffer': framebuffer, 'texture': texture, 'sampler': sampler});
        }

        this.inject_state_fb = {
            'framebuffer': gl.createFramebuffer(),
            'texture': this._setupTexture(gl, state_img),
            'sampler': gl.getUniformLocation(this.inject_program, 'u_sampler_cur')
        };

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.inject_state_fb['framebuffer']);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.inject_state_fb['texture']['texture'], 0);

        this.inject_state(gl, this.state);

        this.is_initialized = true;
    }

    inject_state(gl: WebGLRenderingContext, state: ShallowWaterStateType, clear_state?: boolean) {
        clear_state = clear_state === undefined ? false : clear_state;

        if (state['z'].length != this.grid['nx'] * this.grid['ny']) {
            throw `Grid dimensions (${this.grid['nx']}, ${this.grid['ny']}) and data length ${state['z'].length} do not match`;
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
            'width': this.grid['nx'], 'height': this.grid['ny'], 'image': img_data,
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

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.inject_state_fb['framebuffer']);
        gl.viewport(0, 0, this.grid['nx'], this.grid['ny']);

        const main_state_texture = {'attributes': {}, 'uniforms': {'sampler': this.inject_state_fb['sampler']}, 'texture': this.stages[0]['texture']['texture']};

        this._bindVertices(gl, this.inject_vertices);
        this._bindTexture(gl, 0, texture);
        this._bindTexture(gl, 1, main_state_texture);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        
        // Now copy the injection framebuffer back into the main state
        this._bindTexture(gl, 0, main_state_texture);
        gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, this.grid['nx'], this.grid['ny'], 0);

        // Delete injected state texture
        gl.deleteTexture(texture['texture']);
        gl.deleteBuffer(texture['tex_coord']);
    }

    advance(gl: WebGLRenderingContext, dt: number) {
        if (!this.is_initialized) return;

        gl.useProgram(this.program);
        gl.viewport(0, 0, this.grid['nx'], this.grid['ny']);

        this._bindVertices(gl, this.vertices);
        this._bindVertices(gl, this.texcoords);

        gl.uniform2f(this.u_unit, 1 / (this.grid['nx'] - 1), 1 / (this.grid['ny'] - 1));
        gl.uniform1f(this.u_dx, this.grid['dx']);
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
        gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, this.grid['nx'], this.grid['ny'], 0);
    }

    render(gl: WebGLRenderingContext) {
        if (!this.is_initialized) return;

        gl.useProgram(this.render_program);
        gl.viewport(0, 0, this.grid['nx'] * 2, this.grid['ny'] * 2);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        this._bindVertices(gl, this.render_vertices);
        this._bindVertices(gl, this.render_texcoords);
        this._bindTexture(gl, 0, this.stages[0]['texture'], false);
        gl.uniform1i(this.render_u_sampler, 0);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
}

export {ShallowWaterSolver, GridType, ShallowWaterStateType};