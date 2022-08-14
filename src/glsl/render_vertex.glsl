
attribute vec2 a_pos;
attribute vec2 a_tex_coord;
attribute vec2 a_offset;

uniform highp float u_dot_size;
uniform highp float u_aspect;

varying highp vec2 v_tex_coord;
varying highp vec2 v_state_coord;

mat2 scalingMatrix(float x_scale, float y_scale) {
    return mat2(x_scale, 0.0,    
                0.0,     y_scale);
}

void main() {
    mat2 aspect_matrix = scalingMatrix(1., u_aspect);
    gl_Position = vec4(a_pos + u_dot_size * aspect_matrix * a_offset, 0., 1.);

    v_state_coord = (a_pos + 1.) / 2.;
    v_tex_coord = a_tex_coord;
}