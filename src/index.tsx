import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import './index.css';
import ShallowWaterApp from './App';
import reportWebVitals from './reportWebVitals';

const root_elem = document.getElementById('root');

if (root_elem !== null) {
    const root = ReactDOM.createRoot(root_elem);
    root.render(
        <React.StrictMode>
            <ShallowWaterApp />
        </React.StrictMode>
    );
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
