
uniform sampler2D u_sampler;
uniform sampler2D u_colormap_sampler;

varying highp vec2 v_tex_coord;
varying highp vec2 v_state_coord;

highp float cmap_min = -1.;
highp float cmap_max = 1.;

void main() {
    highp float dot_pos = length(v_tex_coord - vec2(0.5, 0.5));

    if (dot_pos > 0.6) discard;

    highp float logistic_k = 250.;
    highp float logistic_max = 1.;

    highp vec3 tex = texture2D(u_sampler, v_state_coord).rgb;
    highp float hght = tex.r;
    highp float scaled_hght = 2. * logistic_max * (1. / (1. + exp(-logistic_k * hght)) - 0.5);

    highp float cmap_coord = clamp((scaled_hght - cmap_min) / (cmap_max - cmap_min), 0., 1.);
    highp vec3 color = texture2D(u_colormap_sampler, vec2(cmap_coord, 0.5)).rgb;
    highp float alpha = clamp((0.6 - dot_pos) / (0.6 - 0.4), 0., 1.);

    gl_FragColor = vec4(color, alpha);
}