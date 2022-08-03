window.onload = () => {
    const canvas = document.getElementById('main');
    const canvas_rect = canvas.getBoundingClientRect();

    const readout = document.getElementById('readout');
    const instructions = document.getElementById('instructions');

    canvas.width = canvas_rect.width * 2;
    canvas.height = canvas_rect.height * 2;

    let mouse_x = null, mouse_y = null;

    const gl = canvas.getContext('webgl');

    gl.clearColor(0., 0., 0., 1.);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const nx = canvas.width / 2;
    const ny = canvas.height / 2;
    let initial_state = create_shallow_water_state(nx, ny, 'quiescent');
    initial_state = {...initial_state, 'nx': nx, 'ny': ny, 'dx': 0.1};

    const solver = new ShallowWaterSolver(initial_state);
    solver.setup(gl);
    solver.render(gl);
    let last_timestep = null;
    let is_animating = true;

    let dt = 1/105;
    let fps = null;
    let n_frames = 0;
    const n_frames_mean = 600;
    let fps_list = [];

    const advance_and_render = dt => {
        solver.advance(gl, dt);
        solver.render(gl);
    }

    const do_animation = timestep => {
        n_frames++;
        let readout_str = "";
        if (last_timestep !== null) {
            const fps_this_frame = 1000. / (timestep - last_timestep);
            fps_list.push(fps_this_frame);
            const fps_first_frame = fps_list.length > n_frames_mean ? fps_list.shift() : 0;

            if (fps === null) {
                fps = fps_this_frame
            }
            else {
                fps += fps_first_frame == 0 ? (fps_this_frame - fps) / n_frames : (fps_this_frame - fps_first_frame) / n_frames;
            }

            readout_str = `${Math.round(fps * 100) / 100} FPS (${Math.round(fps * dt * 10) / 10} &times; realtime)`;
        }

        advance_and_render(dt);

        if (mouse_x !== null && mouse_y !== null) {
            
        }

        readout.innerHTML = readout_str;

        if (is_animating) {
            last_timestep = timestep;
            window.requestAnimationFrame(do_animation);
        }
    }

    window.requestAnimationFrame(do_animation);

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
            advance_and_render(dt);
        }
        else if (event.key == 'Escape') {
            let state = create_shallow_water_state(nx, ny, 'quiescent');
            state = {...state, 'nx': nx, 'ny': ny};
            solver.inject_state(gl, state, true);
        }
    }

    window.onclick = event => {
        let state = create_shallow_water_state(nx, ny, 'drop', event.pageX, ny - event.pageY);
        state = {...state, 'nx': nx, 'ny': ny};
        solver.inject_state(gl, state);
        instructions.style.display = 'none';
    }

    window.onmousemove = event => {
        mouse_x = event.pageX;
        mouse_y = event.pageY;
    }
}

function create_shallow_water_state() {
    const nx = arguments[0];
    const ny = arguments[1];
    const method = arguments[2] === undefined ? 'random' : arguments[2];
    const method_args = [...arguments].slice(3);

    const initial_z = new Float32Array(nx * ny);
    const initial_u = new Float32Array(nx * ny);
    const initial_v = new Float32Array(nx * ny);

    const random_ics = () => {
        return (i, j, idx) => {
            initial_z[idx] = Math.random();
            initial_u[idx] = Math.random();
            initial_v[idx] = Math.random();
        }
    }

    const quiescent = () => {
        return (i, j, idx) => {}
    }

    const bump = (center_x, center_y, filter_width) => {
        center_x = center_x === undefined ? nx / 4 : center_x;
        center_x = center_y === undefined ? nx / 3 : center_y;
        filter_width = filter_width === undefined ? nx / 64 : filter_width;

        return (i, j, idx) => {
            const x_term = (i - center_x) / filter_width;
            const y_term = (j - center_y) / filter_width;
            initial_z[idx] = 2 * Math.exp(-(x_term * x_term) - (y_term * y_term));
        }
    }

    const drop = (center_x, center_y, filter_width, amplitude, shape) => {
        center_x = center_x === undefined ? nx / 4 : center_x;
        center_y = center_y === undefined ? ny / 3 : center_y;
        filter_width = filter_width === undefined ? nx / 64 : filter_width;
        amplitude = amplitude === undefined ? 1 : amplitude;
        shape = shape === undefined ? 10 : shape;

        const shape_fac = (shape + amplitude) / shape;
        const o_filter_width = 1 / filter_width;
        const cutoff = filter_width * 4;

        return (i, j, idx) => {
            if (Math.abs(i - center_x) < cutoff && Math.abs(j - center_y) < cutoff) {
                const x_term = (i - center_x) * o_filter_width;
                const y_term = (j - center_y) * o_filter_width;
                const rad_term = -x_term * x_term - y_term * y_term;
        
                initial_z[idx] = shape * Math.exp(rad_term) - (shape + amplitude) * Math.exp(rad_term * shape_fac);
            }
        }
    }

    const gen = {
        'random': random_ics,
        'quiescent': quiescent,
        'bump': bump,
        'drop': drop,
    }[method];

    if (gen === undefined) {
        throw `Unknown generation method '${method}'`;
    }

    const gen_meth = gen(...method_args);

    for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
            const idx = i + nx * j;  
            gen_meth(i, j, idx);
        }
    }

    return {'z': initial_z, 'u': initial_u, 'v': initial_v};
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