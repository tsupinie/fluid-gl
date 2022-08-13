
import { useState } from 'react';
import './App.css';
import ShallowWaterViewer from './ShallowWaterViewer';

function ShallowWaterApp() {
    let [readout, set_readout] = useState('120 FPS');
    let [instructions_visible, set_instructions_visible] = useState(true);


    let instructions = <div></div>;
    if (instructions_visible) {
        instructions = <div id="instructions">Click to throw a rock into the water as many times as you like
                            <br/><span className="key">SPACE</span> Pause/unpause<span className="spacer"></span><span className="key">ESC</span> Reset
                       </div>;
    }

    return (
        <div className="App">
            <ShallowWaterViewer
                onfpschange={set_readout}
                onshowhideinstructions={set_instructions_visible}
            ></ShallowWaterViewer>
            <div id="readout">{readout}</div>
            {instructions}
        </div>
    );
}

export default ShallowWaterApp;