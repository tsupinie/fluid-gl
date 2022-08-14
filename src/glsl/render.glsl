
uniform sampler2D u_sampler;
uniform sampler2D u_colormap_sampler;
uniform highp vec2 u_unit;

varying highp vec2 v_tex_coord;

highp float cmap_min = -0.1;
highp float cmap_max = 0.1;

void main() {
    highp vec2 ihat = vec2(u_unit.x, 0.);
    highp vec2 jhat = vec2(0., u_unit.y);
    
    highp vec3 tex = texture2D(u_sampler, v_tex_coord).rgb;
    highp vec3 tex_ip1half = texture2D(u_sampler, v_tex_coord + 0.5 * ihat).rgb;
    highp vec3 tex_jp1half = texture2D(u_sampler, v_tex_coord + 0.5 * jhat).rgb;

    highp float cmap_coord = clamp((tex.r - cmap_min) / (cmap_max - cmap_min), 0., 1.);
    gl_FragColor = texture2D(u_colormap_sampler, vec2(cmap_coord, 0.5));
}