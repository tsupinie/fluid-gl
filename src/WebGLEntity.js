
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

export default WebGLEntity;