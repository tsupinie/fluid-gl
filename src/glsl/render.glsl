
uniform sampler2D u_sampler;

varying highp vec2 v_tex_coord;

void main() {
    highp vec3 tex = texture2D(u_sampler, v_tex_coord).rgb;
    gl_FragColor = vec4(sqrt(sqrt(abs(tex))), 1.);
}