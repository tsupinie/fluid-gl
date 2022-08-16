

import { useEffect } from "react";
import * as React from "react";

import {ShallowWaterSolver, ShallowWaterStateType, GridType} from "./ShallowWaterSolver";
import "./ShallowWaterViewer.css";
import Renderer from "./Renderer";

enum ICMethod {
    'random',
    'quiescent',
    'bump',
    'drop'
}

function create_shallow_water_state(grid: GridType, method?: ICMethod, ...method_args: any[]): ShallowWaterStateType {
    method = method === undefined ? ICMethod.random : method;

    const nx = grid['nx'], ny = grid['ny'];

    const initial_z = new Float32Array(nx * ny);
    const initial_u = new Float32Array(nx * ny);
    const initial_v = new Float32Array(nx * ny);

    const random_ics = () : Function => {
        return (i: number, j: number, idx: number) : void => {
            initial_z[idx] = Math.random();
            initial_u[idx] = Math.random();
            initial_v[idx] = Math.random();
        }
    }

    const quiescent = () : Function => {
        return (i: number, j: number, idx: number) : void => {}
    }

    const bump = (...args: number[]) : Function => {
        const center_x = args[0] === undefined ? nx / 4 : args[0];
        const center_y = args[1] === undefined ? nx / 3 : args[1];
        const filter_width = args[2] === undefined ? nx / 64 : args[2];

        return (i: number, j: number, idx: number) : void => {
            const x_term = (i - center_x) / filter_width;
            const y_term = (j - center_y) / filter_width;
            initial_z[idx] = 2 * Math.exp(-(x_term * x_term) - (y_term * y_term));
        }
    }

    const drop = (...args: number[]) : Function => {
        const center_x = args[0] === undefined ? nx / 4 : args[0];
        const center_y = args[1] === undefined ? ny / 3 : args[1];
        const filter_width = args[2] === undefined ? nx / 64 : args[2];
        const amplitude = args[3] === undefined ? 0.6 : args[3];
        const shape = args[4] === undefined ? 10 : args[4];

        const shape_fac = (shape + amplitude) / shape;
        const o_filter_width = 1 / filter_width;
        const cutoff = filter_width * 4;

        return (i: number, j: number, idx: number) : void => {
            if (Math.abs(i - center_x) < cutoff && Math.abs(j - center_y) < cutoff) {
                const x_term = (i - center_x) * o_filter_width;
                const y_term = (j - center_y) * o_filter_width;
                const rad_term = -x_term * x_term - y_term * y_term;
        
                initial_z[idx] = shape * Math.exp(rad_term) - (shape + amplitude) * Math.exp(rad_term * shape_fac);
            }
        }
    }
    
    let gen : Function;
    
    switch (method) {
        case ICMethod.random:
            gen = random_ics;
            break;
        case ICMethod.quiescent:
            gen = quiescent;
            break;
        case ICMethod.bump:
            gen = bump;
            break;
        case ICMethod.drop:
            gen = drop;
            break;
        default:
            throw `Unknown generation method '${method}'`;
    }

    const gen_meth = gen(...method_args);

    for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
            const idx = i + nx * j;  
            gen_meth(i, j, idx);
        }
    }

    return {'z': initial_z, 'u': initial_u, 'v': initial_v};
}

function ShallowWaterViewer(props) {
    const canvas: React.RefObject<HTMLCanvasElement> = React.createRef();
    const raf: React.MutableRefObject<number> = React.createRef();

    useEffect(() => {
        const canvas_rect = canvas.current.getBoundingClientRect();

        canvas.current.width = canvas_rect.width * 2;
        canvas.current.height = canvas_rect.height * 2;
    
        let mouse_x = null, mouse_y = null;
    
        const gl = canvas.current.getContext('webgl');
    
        gl.clearColor(0., 0., 0., 1.);
        gl.clear(gl.COLOR_BUFFER_BIT);
    
        const nx = canvas.current.width / 2;
        const ny = canvas.current.height / 2;
        const grid = {'nx': nx + 1, 'ny': ny + 1, 'dx': 0.09};

        const initial_state = create_shallow_water_state(grid, ICMethod.quiescent);
        const solver = new ShallowWaterSolver(gl, grid, initial_state);
        const renderer = new Renderer(solver);

        renderer.render();

        let last_timestep = null;
        let is_animating = true;
        let dt = 1/105;
        let fps = null;
        let n_frames = 0;
        const n_frames_mean = 600;
        let fps_list = [];
    
        const advance_and_render = dt => {
            solver.advance(dt);
            renderer.render();
        }
    
        const do_animation = (timestep: number) => {
            n_frames++;
            let readout_str = "";
            if (last_timestep !== null) {
                const fps_this_frame = 1000. / (timestep - last_timestep);
                fps_list.push(fps_this_frame);
                const fps_first_frame = fps_list.length > n_frames_mean ? fps_list.shift() : 0;
    
                if (fps === null) {
                    fps = fps_this_frame
                }
                else {
                    fps += fps_first_frame == 0 ? (fps_this_frame - fps) / n_frames : (fps_this_frame - fps_first_frame) / n_frames;
                }
    
                readout_str = `${Math.round(fps * 100) / 100} FPS (${Math.round(fps * dt * 10) / 10} × realtime)`;
            }
    
            advance_and_render(dt);
    
            if (mouse_x !== null && mouse_y !== null) {
                
            }
    
            props.onfpschange(readout_str);

            last_timestep = timestep;
            raf.current = window.requestAnimationFrame(do_animation);
        }
    
        raf.current = window.requestAnimationFrame(do_animation);
    
        window.onkeydown = (event: KeyboardEvent) => {
            if (event.key == ' ') {
                is_animating = !is_animating;
                if (is_animating) {
                    console.log('Animation Start');
                    raf.current = window.requestAnimationFrame(do_animation);
                }
                else {
                    console.log('Animation Stop');
                    window.cancelAnimationFrame(raf.current);
                    last_timestep = null;
                }
            }
            else if (event.key == 'ArrowRight') {
                advance_and_render(dt);
            }
            else if (event.key == 'Escape') {
                const state = create_shallow_water_state(grid, ICMethod.quiescent);
                solver.inject_state(state, true);
            }
        }
    
        window.onclick = event => {
            const state = create_shallow_water_state(grid, ICMethod.drop, event.pageX, ny - event.pageY);
            solver.inject_state(state);
            props.onshowhideinstructions(false);
        }
    
        window.onmousemove = (event: MouseEvent) => {
            mouse_x = event.pageX;
            mouse_y = event.pageY;
        }

        return () => window.cancelAnimationFrame(raf.current);
    }, []);

    return (<canvas id="main" ref={canvas}></canvas>);
}

export default ShallowWaterViewer;