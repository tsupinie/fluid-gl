
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

    highp vec3 out_tex;

    if (u_istage == 0) {
        out_tex = tex + u_dt * dtex_dt;
    }
    else if (u_istage == 1) {
        highp vec3 tex_stage0 = texture2D(u_stage0_sampler, v_tex_coord).rgb;
        out_tex = 0.5 * ((tex_stage0 + tex) + u_dt * dtex_dt);

        // Apply impermeability condition for u and v
        if (v_tex_coord.x - ihat.x < 0. || v_tex_coord.x + ihat.x > 1.) {
            out_tex.g = 0.;
        }
        if (v_tex_coord.y - jhat.y < 0. || v_tex_coord.y + jhat.y > 1.) {
            out_tex.b = 0.;
        }
    }

    gl_FragColor = vec4(out_tex, 1.);
}