
attribute vec2 a_pos;
attribute vec2 a_tex_coord;

varying highp vec2 v_tex_coord;

void main() {
    gl_Position = vec4(a_pos, 0., 1.);

    v_tex_coord = a_tex_coord;
}