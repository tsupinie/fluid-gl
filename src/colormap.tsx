
import seismic_colors from './json/seismic.json';

class Colormap {
    colors: string[];

    constructor(colors: string[]) {
        this.colors = colors;
    }

    getImage() : HTMLCanvasElement {
        const canvas = document.createElement('canvas');

        canvas.width = this.colors.length;
        canvas.height = 1;

        const ctx = canvas.getContext('2d');

        this.colors.forEach((stop, istop) => {
            ctx.fillStyle = stop;
            ctx.fillRect(istop, 0, 1, 1);
        });

        return canvas;
    }
}

const seismic_colormap = new Colormap(seismic_colors);

export {seismic_colormap};