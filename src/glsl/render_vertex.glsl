
attribute vec2 a_pos;
attribute vec2 a_tex_coord;
attribute vec2 a_offset;

uniform highp float u_dot_size;
uniform highp float u_aspect;

varying highp vec2 v_tex_coord;
varying highp vec2 v_state_coord;

mat4 scalingMatrix(float x_scale, float y_scale, float z_scale) {
    return mat4(x_scale, 0.0,     0.0,     0.0,
                0.0,     y_scale, 0.0,     0.0,
                0.0,     0.0,     z_scale, 0.0,
                0.0,     0.0,     0.0,     1.0);
}

void main() {
    mat4 aspect_matrix = scalingMatrix(1., u_aspect, 1.);
    gl_Position = aspect_matrix * vec4(a_pos + u_dot_size * a_offset, 0., 1.);

    v_state_coord = (a_pos + 1.) / 2.;
    v_tex_coord = a_tex_coord;
}