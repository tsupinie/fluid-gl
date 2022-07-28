window.onload = () => {
    const canvas = document.getElementById('main');
    const canvas_rect = canvas.getBoundingClientRect();

    canvas.width = canvas_rect.width * 2;
    canvas.height = canvas_rect.height * 2;

    const gl = canvas.getContext('webgl');

    gl.clearColor(0., 0., 0., 1.);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const nx = canvas.width / 2;
    const ny = canvas.height / 2;
    const initial_state = create_shallow_water_state(nx, ny, 0.1, 'bump');

    const solver = new ShallowWaterSolver(initial_state);
    solver.setup(gl);
    solver.render(gl);
    let last_timestep = null;
    let is_animating = false;

    let dt = null;
    let n_frames = 0;

    do_animation = timestep => {
        n_frames++;
        if (last_timestep !== null) {
            const dt_this_frame = (timestep - last_timestep) / 1000.;

            if (dt === null) {
                dt = dt_this_frame
            }
            else {
                dt += (dt_this_frame - dt) / n_frames;
            }

            solver.advance(gl, dt);
            solver.render(gl);
        }

        if (is_animating) {
            last_timestep = timestep;
            window.requestAnimationFrame(do_animation);
        }
    }

    window.onkeydown = event => {
        if (event.key == ' ') {
            is_animating = !is_animating;
            if (is_animating) {
                console.log('Animation Start');
                window.requestAnimationFrame(do_animation);
            }
            else {
                console.log('Animation Stop');
                last_timestep = null;
            }
        }
        else if (event.key == 'ArrowRight') {
            is_animating = true;
            window.requestAnimationFrame(do_animation);
            is_animating = false;
            window.requestAnimationFrame(do_animation);
        }
    }
}

function create_shallow_water_state(nx, ny, dx, method) {
    method = method === undefined ? 'random' : method;

    const initial_z = new Float32Array(nx * ny);
    const initial_u = new Float32Array(nx * ny);
    const initial_v = new Float32Array(nx * ny);

    const random_ics = () => {
        for (let j = 0; j < ny; j++) {
            for (let i = 0; i < nx; i++) {
                const idx = i + nx * j;
                initial_z[idx] = Math.random();
                initial_u[idx] = Math.random();
                initial_v[idx] = Math.random();
            }
        }
    }

    const bump = () => {
        const filter_width = nx / 64;
        for (let j = 0; j < ny; j++) {
            for (let i = 0; i < nx; i++) {
                const idx = i + nx * j;
                const x_term = (i - nx / 4) / filter_width;
                const y_term = (j - ny / 2) / filter_width;
                initial_z[idx] = 2 * Math.exp(-(x_term * x_term) - (y_term * y_term));
                initial_u[idx] = 0.
                initial_v[idx] = 0.
            }
        }
    }

    const gen_meth = {
        'random': random_ics,
        'bump': bump
    }[method];

    if (gen_meth === undefined) {
        throw `Unknown generation method '${method}'`;
    }

    gen_meth();

    return {'nx': nx, 'ny': ny, 'dx': dx, 'z': initial_z, 'u': initial_u, 'v': initial_v};
}

class WebGLEntity {
    _compileAndLinkShaders(gl, vertex_shader_src, frag_shader_src) {
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

    _setupVertices(gl, program, verts, nverts_per_entry, a_vert_name) {
        let ret = {'attributes': {}, 'uniforms': {}};

        const DTYPES = {
            'Float32Array': gl.FLOAT,
            'Uint8Array': gl.UNSIGNED_BYTE,
        }

        ret['dtype'] = DTYPES[verts.constructor.name];
        ret['nverts_per_entry'] = nverts_per_entry;

        ret['attributes'][a_vert_name] = gl.getAttribLocation(program, a_vert_name);

        ret['vertices'] = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, ret['vertices']);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

        return ret;
    }

    _setupTexture(gl, image, program, u_sampler_name, tex_coords, a_tex_coord_name) {
        let ret = {'attributes': {}, 'uniforms': {}};

        ret['texture'] = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, ret['texture']);

        if ('width' in image && 'height' in image) {
            gl.texImage2D(gl.TEXTURE_2D, 0, image['format'], image['width'], image['height'], 0, 
                image['format'], image['type'], image['image']);
        }
        else {
            gl.texImage2D(gl.TEXTURE_2D, 0, image['format'], 
                image['format'], image['type'], image['image']);
        }
        
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, image['mag_filter']);

        if (tex_coords !== undefined && a_tex_coord_name !== undefined && program !== undefined && u_sampler_name !== undefined) {
            ret['uniforms'][u_sampler_name] = gl.getUniformLocation(program, u_sampler_name);
            ret['attributes'][a_tex_coord_name] = gl.getAttribLocation(program, a_tex_coord_name);

            ret['tex_coord'] = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, ret['tex_coord']);
            gl.bufferData(gl.ARRAY_BUFFER, tex_coords, gl.STATIC_DRAW);
        }

        return ret;
    }

    _bindVertices(gl, vertices) {
        gl.bindBuffer(gl.ARRAY_BUFFER, vertices['vertices']);
        Object.values(vertices['attributes']).forEach(attr => {
            gl.enableVertexAttribArray(attr);
            gl.vertexAttribPointer(attr, vertices['nverts_per_entry'], vertices['dtype'], false, 0, 0);
        });
    }

    _bindTexture(gl, gl_tex_num, texture, bind_texcoords) {
        bind_texcoords = bind_texcoords === undefined ? true : bind_texcoords;
        if ('tex_coord' in texture && bind_texcoords) {
            gl.bindBuffer(gl.ARRAY_BUFFER, texture['tex_coord']);
            Object.entries(texture['attributes']).forEach(([att_name, att]) => {
                gl.enableVertexAttribArray(att);
                gl.vertexAttribPointer(att, 2, gl.FLOAT, false, 0, 0);
            });
        }

        gl.activeTexture(gl['TEXTURE' + gl_tex_num]);
        gl.bindTexture(gl.TEXTURE_2D, texture['texture']);
        Object.entries(texture['uniforms']).forEach(([uni_name, uni]) => {
            gl.uniform1i(uni, gl_tex_num);
        })
    }
}

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

        const ic_fragment_shader_src = `
        uniform sampler2D u_sampler;

        varying highp vec2 v_tex_coord;

        void main() {
            highp vec3 tex = texture2D(u_sampler, v_tex_coord).rgb;
            gl_FragColor = vec4(tex, 1.);
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

            highp vec3 dtex_dx = (tex_ip1 - tex_im1) / (2. * u_dx);
            highp vec3 dtex_dy = (tex_jp1 - tex_jm1) / (2. * u_dx);   
            highp vec3 d2tex_dx2 = (tex_ip1 - 2. * tex + tex_im1) / (4. * u_dx * u_dx);
            highp vec3 d2tex_dy2 = (tex_jp1 - 2. * tex + tex_jm1) / (4. * u_dx * u_dx);

            // Apply Neumann BC for height
            if (v_tex_coord.x - ihat.x < 0. || v_tex_coord.x + ihat.x > 1.) {
                dtex_dx.r = 0.;
            }
            if (v_tex_coord.y - jhat.y < 0. || v_tex_coord.y + jhat.y > 1.) {
                dtex_dy.r = 0.;
            }

            highp vec3 dtex_dt = vec3(0., 0., 0.);

            highp float mean_depth = 2.;
            highp float kinematic_viscosity = 5e-2;

            dtex_dt.r = -((mean_depth + tex.r) * dtex_dx.g + tex.g * dtex_dx.r + (mean_depth + tex.r) * dtex_dy.b + tex.b * dtex_dy.r);
            dtex_dt.g = -9.806 * dtex_dx.r - tex.g * dtex_dx.g - tex.b * dtex_dy.g + kinematic_viscosity * (d2tex_dx2.g + d2tex_dy2.g);
            dtex_dt.b = -9.806 * dtex_dy.r - tex.g * dtex_dx.b - tex.b * dtex_dy.b + kinematic_viscosity * (d2tex_dx2.b + d2tex_dy2.b);

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
            gl_FragColor = vec4(abs(tex), 1.);
        }
        `;

        const ic_program = this._compileAndLinkShaders(gl, vertex_shader_src, ic_fragment_shader_src);
        this.program = this._compileAndLinkShaders(gl, vertex_shader_src, fragment_shader_src);
        this.render_program = this._compileAndLinkShaders(gl, vertex_shader_src, render_fragment_shader_src);

        const verts = new Float32Array([-1.0, 1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0]);
        const tex_coords = new Float32Array([0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0]);

        const ic_vertices = this._setupVertices(gl, ic_program, verts, 2, 'a_pos');
        this.vertices = this._setupVertices(gl, this.program, verts, 2, 'a_pos');
        this.render_vertices = this._setupVertices(gl, this.render_program, verts, 2, 'a_pos');

        this.texcoords = this._setupVertices(gl, this.program, tex_coords, 2, 'a_tex_coord');
        this.render_texcoords = this._setupVertices(gl, this.render_program, tex_coords, 2, 'a_tex_coord');

        this.render_u_sampler = gl.getUniformLocation(this.render_program, 'u_sampler');

        // Set up IC texture
        const img_data = new Float32Array(this.state['z'].length * 4);
        for (let idx = 0; idx < this.state['z'].length; idx++) {
            img_data[4 * idx + 0] = this.state['z'][idx];
            img_data[4 * idx + 1] = this.state['u'][idx];
            img_data[4 * idx + 2] = this.state['v'][idx];
            img_data[4 * idx + 3] = 0.;
        }
        
        const ic_img = {
            'format': gl.RGBA, 'type': gl.FLOAT, 
            'width': this.state['nx'], 'height': this.state['ny'], 'image': img_data,
            'mag_filter': gl.LINEAR
        }

        const ic_texture = this._setupTexture(gl, ic_img, ic_program, 'u_sampler', tex_coords, 'a_tex_coord');

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

        // Put the model ICs into the state framebuffer
        gl.useProgram(ic_program);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.stages[0]['framebuffer']);
        gl.viewport(0, 0, this.state['nx'], this.state['ny']);

        this._bindVertices(gl, ic_vertices);
        this._bindTexture(gl, 0, ic_texture);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        this.is_initialized = true;
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