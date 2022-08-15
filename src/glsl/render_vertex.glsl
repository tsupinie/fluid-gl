
attribute vec2 a_pos;
attribute vec2 a_tex_coord;
attribute vec2 a_offset;

uniform highp float u_dot_size;
uniform highp float u_aspect;
uniform sampler2D u_sampler;
uniform vec2 u_unit;

varying highp vec2 v_tex_coord;
varying highp vec2 v_state_coord;

mat2 scalingMatrix(float x_scale, float y_scale) {
    return mat2(x_scale, 0.0,    
                0.0,     y_scale);
}

void main() {
    highp vec2 ihat = vec2(u_unit.x, 0.);
    highp vec2 jhat = vec2(0., u_unit.y);

    mat2 aspect_matrix = scalingMatrix(1., u_aspect);
    gl_Position = vec4(a_pos + u_dot_size * aspect_matrix * a_offset, 0., 1.);

    v_state_coord = (a_pos + 1.) / 2.;

    highp float logistic_k = 50.;
    highp float logistic_max = 0.02;

    highp vec3 state_ip1half = texture2D(u_sampler, v_state_coord + 0.5 * ihat).rgb;
    highp vec3 state_jp1half = texture2D(u_sampler, v_state_coord + 0.5 * jhat).rgb;

    highp vec2 disp = vec2(state_ip1half.g, state_jp1half.b);
    highp float disp_size = length(disp);
    highp float scaled_disp_size = 2. * logistic_max * (1. / (1. + exp(-logistic_k * disp_size)) - 0.5);

    highp vec2 scaled_disp = disp / max(1e-6, disp_size) * scaled_disp_size;

    gl_Position = vec4(a_pos + aspect_matrix * (u_dot_size * a_offset + scaled_disp), 0., 1.);

    v_tex_coord = a_tex_coord;
}