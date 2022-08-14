
uniform sampler2D u_sampler;
uniform highp vec2 u_unit;

varying highp vec2 v_tex_coord;

void main() {
    highp vec2 ihat = vec2(u_unit.x, 0.);
    highp vec2 jhat = vec2(0., u_unit.y);

    highp vec3 tex = texture2D(u_sampler, v_tex_coord).rgb;
    highp vec3 tex_ip1half = texture2D(u_sampler, v_tex_coord + 0.5 * ihat).rgb;
    highp vec3 tex_jp1half = texture2D(u_sampler, v_tex_coord + 0.5 * jhat).rgb;

    highp vec3 disp_tex = vec3(tex.r, tex_ip1half.g, tex_jp1half.b);
    gl_FragColor = vec4(sqrt(sqrt(abs(disp_tex))), 1.);
}