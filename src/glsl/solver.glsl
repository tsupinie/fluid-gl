
uniform sampler2D u_sampler;
uniform sampler2D u_time_t_sampler;

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
    highp float odx = 1. / u_dx;
    highp float ody = 1. / u_dx;

    highp vec3 tex, tex_ip1, tex_jp1, tex_im1, tex_jm1, tex_ip1half, tex_im1half, tex_jp1half, tex_jm1half, tex_ip1_jm1half, tex_im1half_jp1;

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

    // Grab the state at this location and surrounding locations
    tex = texture2D(u_sampler, v_tex_coord).rgb;
    tex_ip1 = texture2D(u_sampler, v_tex_coord + ihat).rgb;
    tex_jp1 = texture2D(u_sampler, v_tex_coord + jhat).rgb;
    tex_im1 = texture2D(u_sampler, v_tex_coord - ihat).rgb;
    tex_jm1 = texture2D(u_sampler, v_tex_coord - jhat).rgb;
    tex_ip1half = 0.5 * (tex + tex_ip1);
    tex_im1half = 0.5 * (tex + tex_im1);
    tex_jp1half = 0.5 * (tex + tex_jp1);
    tex_jm1half = 0.5 * (tex + tex_jm1);
    tex_ip1_jm1half = texture2D(u_sampler, v_tex_coord + ihat - 0.5 * jhat).rgb;
    tex_im1half_jp1 = texture2D(u_sampler, v_tex_coord - 0.5 * ihat + jhat).rgb;

    // Finite differences
    highp float dz_dx = (tex.r /* hght */ - tex_im1.r /* hght_i-1 */) * odx;     // Defined at u point
    highp float dz_dy = (tex.r /* hght */ - tex_jm1.r /* hght_j-1 */) * ody;     // Defined at v point
    highp float du_dx = (tex_ip1.g /* u_i+1 */ - tex.g /* u */) * odx; // Defined at scalar point
    highp float dv_dy = (tex_jp1.b /* v_j+1 */ - tex.b /* v */) * ody; // Defined at scalar point

    // 2nd order advection
    highp float dz_flux_dx = (tex_ip1.g /* u_i+1 */ * tex_ip1half.r /* hght_i+1/2 */ - tex.g /* u */ * tex_im1half.r /* hght_i-1/2 */) * odx;
    highp float dz_flux_dy = (tex_jp1.b /* v_j+1 */ * tex_jp1half.r /* hght_j+1/2 */ - tex.b /* v */ * tex_jm1half.r /* hght_j-1/2 */) * ody;
    highp float du_flux_dx = (tex_ip1half.g /* u_i+1/2 */ * tex_ip1half.g /* u_i+1/2 */ - tex_im1half.g /* u_i-1/2 */ * tex_im1half.g /* u_i-1/2 */) * odx;
    highp float du_flux_dy = (tex_im1half_jp1.b /* v_i-1/2,j+1 */ * tex_jp1half.g /* u_j+1/2 */ - tex_im1half.b /* v_i-1/2 */ * tex_jm1half.g /* u_j-1/2 */) * ody;
    highp float dv_flux_dx = (tex_ip1_jm1half.g /* u_i+1,j-1/2 */ * tex_ip1half.b /* v_i+1/2 */ - tex_jm1half.g /* u_j-1/2 */ * tex_im1half.b /* v_i-1/2 */) * odx;
    highp float dv_flux_dy = (tex_jp1half.b /* v_j+1/2 */ * tex_jp1half.b /* v_j+1/2 */ - tex_jm1half.b /* v_j-1/2 */ * tex_jm1half.b /* v_j-1/2 */) * ody;
    highp vec2 dwind_flux_dx = vec2(du_flux_dx, dv_flux_dx);
    highp vec2 dwind_flux_dy = vec2(du_flux_dy, dv_flux_dy);

    // 2nd order diffusion
    highp float d2z_dx2 = (tex_ip1.r /* hght_i+1 */ - 2. * tex.r /* hght */ + tex_im1.r /* hght_i-1 */) * odx * odx;
    highp float d2z_dy2 = (tex_jp1.r /* hght_j+1 */ - 2. * tex.r /* hght */ + tex_jm1.r /* hght_j-1 */) * ody * ody;
    highp vec2 d2wind_dx2 = (tex_ip1.gb /* wind_i+1 */ - 2. * tex.gb /* wind */ + tex_im1.gb /* wind_i-1 */) * odx * odx;
    highp vec2 d2wind_dy2 = (tex_jp1.gb /* wind_j+1 */ - 2. * tex.gb /* wind */ + tex_jm1.gb /* wind_j-1 */) * ody * ody;

    // Apply Neumann BC for height
    if (v_tex_coord.x - ihat.x < 0. || v_tex_coord.x + 2. * ihat.x > 1.) {
        dz_flux_dx = 0.;
    }
    if (v_tex_coord.y - jhat.y < 0. || v_tex_coord.y + 2. * jhat.y > 1.) {
        dz_flux_dy = 0.;
    }

    // Compute tendencies
    highp vec3 dtex_dt = vec3(0., 0., 0.);

    dtex_dt.r = -(mean_depth + tex.r /* hght */) * (du_dx + dv_dy) - dz_flux_dx - dz_flux_dy + inv_turb_prandtl * kinematic_viscosity * (d2z_dx2 + d2z_dy2);
    dtex_dt.gb = -9.806 * vec2(dz_dx, dz_dy) - dwind_flux_dx - dwind_flux_dy + kinematic_viscosity * (d2wind_dx2 + d2wind_dy2);

    highp vec3 out_tex;

    if (u_istage == 0) {
        // RK3 stage 1
        out_tex = tex + u_dt / 3. * dtex_dt;
    }
    else if (u_istage == 1) {
        // RK3 stage 2
        highp vec3 tex_stage0 = texture2D(u_time_t_sampler, v_tex_coord).rgb;
        out_tex = tex_stage0 + 0.5 * u_dt * dtex_dt;
    }
    else if (u_istage == 2) {
        // RK3 stage 3
        highp vec3 tex_stage0 = texture2D(u_time_t_sampler, v_tex_coord).rgb;
        out_tex = tex_stage0 + u_dt * dtex_dt;

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