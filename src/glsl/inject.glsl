
uniform sampler2D u_sampler_new;
uniform sampler2D u_sampler_cur;

varying highp vec2 v_tex_coord;

void main() {
    highp vec3 tex_new = texture2D(u_sampler_new, v_tex_coord).rgb;
    highp vec3 tex_cur = texture2D(u_sampler_cur, v_tex_coord).rgb;
    gl_FragColor = vec4(tex_new + tex_cur, 1.);
}