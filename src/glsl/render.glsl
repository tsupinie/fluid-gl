
uniform sampler2D u_sampler;
uniform sampler2D u_colormap_sampler;

varying highp vec2 v_tex_coord;
varying highp vec2 v_state_coord;

highp float cmap_min = -0.1;
highp float cmap_max = 0.1;

void main() {
    highp float dot_pos = length(v_tex_coord - vec2(0.5, 0.5));

    if (dot_pos > 0.5) discard;

    highp vec3 tex = texture2D(u_sampler, v_state_coord).rgb;

    highp float cmap_coord = clamp((tex.r - cmap_min) / (cmap_max - cmap_min), 0., 1.);
    gl_FragColor = texture2D(u_colormap_sampler, vec2(cmap_coord, 0.5));
}