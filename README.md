## fluid-gl
Solving the shallow water equations in WebGL

### Running the code
```bash
cd fluid-gl
npm install # Install dependencies
npm start # Start development server
```

### Methods
The shallow water equations I've implemented here are

$$
\begin{align}
\frac{\partial z}{\partial t} & = -(H + z)\left(\frac{\partial u}{\partial x} + \frac{\partial v}{\partial y}\right) 
      - u\frac{\partial z}{\partial x} - v\frac{\partial z}{\partial y} 
      + \nu_z \left(\frac{\partial^2 z}{\partial x^2} + \frac{\partial^2 z}{\partial y^2}\right), \\
\frac{\partial u}{\partial t} & = -g \frac{\partial z}{\partial x} 
      - u\frac{\partial u}{\partial x} - v\frac{\partial u}{\partial y}
      + \nu_m \left(\frac{\partial^2 u}{\partial x^2} + \frac{\partial^2 u}{\partial y^2}\right), \\
\frac{\partial v}{\partial t} & = -g \frac{\partial z}{\partial y} 
      - u\frac{\partial v}{\partial x} - v\frac{\partial v}{\partial y}
      + \nu_m \left(\frac{\partial^2 v}{\partial x^2} + \frac{\partial^2 v}{\partial y^2}\right),
\end{align}
$$

where $z$ is the height perturbation, $H$ is the mean height of the fluid, $u$ and $v$ are the components of the flow in the $x$ and $y$ directions respectively, $g$ is acceleration due to gravity, and $\nu_z$ and $\nu_m$ are the kinematic viscosities for height and momentum. In this implementation, $H = 5\mathrm{m}$, $g = 9.806 \mathrm{m s^{-2}}$, $\nu_m = 1 \times 10^{-2} \mathrm{m^2 s^{-1}}$, and $\nu_z = \frac{\nu_m}{\mathrm{Pr}}$, where Pr = $\frac{1}{3}$ is the turblent Prandtl number.

These equations are discretized on an Arakawa C grid with $\Delta x = \Delta y = 0.09 \mathrm{m}$. The divergence term in the $z$ equation and the PGF terms in the $u$ and $v$ equation are implemented with second order finite differences.

$$
\begin{align}
\frac{\partial q}{\partial x}\bigg\rvert_{i,\\;j} & \approx \frac{q_{i+\frac{1}{2},\\;j} - q_{i-\frac{1}{2},\\;j}}{\Delta x}, \\
\frac{\partial q}{\partial y}\bigg\rvert_{i,\\;j} & \approx \frac{q_{i,\\;j+\frac{1}{2}} - q_{i,\\;j-\frac{1}{2}}}{\Delta y},
\end{align}
$$

where $q$ is any quantity. The advection terms are also discretized using the second-order approximation

$$
\begin{align}
u\frac{\partial q}{\partial x}\bigg\rvert_{i,\\;j} & \approx \frac{u_{i+\frac{1}{2},\\;j}\\;q_{i+\frac{1}{2},\\;j} - u_{i-\frac{1}{2},\\;j}\\;q_{i-\frac{1}{2},\\;j}}{\Delta x}, \\
v\frac{\partial q}{\partial y}\bigg\rvert_{i,\\;j} & \approx \frac{v_{i,\\;j+\frac{1}{2}}\\;q_{i,\\;j+\frac{1}{2}} - v_{i,\\;j-\frac{1}{2}}\\;q_{i,\\;j-\frac{1}{2}}}{\Delta y}.
\end{align}
$$

Diffusion is again a second-order approximation:

$$
\begin{align}
\frac{\partial^2 q}{\partial x^2}\bigg\rvert_{i,\\;j} & \approx \frac{q_{i+1,\\;j} - 2 q_{i,\\;j} + q_{i-1,\\;j}}{(\Delta x)^2}, \\
\frac{\partial^2 q}{\partial y^2}\bigg\rvert_{i,\\;j} & \approx \frac{q_{i,\\;j+1} - 2 q_{i,\\;j} + q_{i,\\;j-1}}{(\Delta y)^2}.
\end{align}
$$

The solution is advanced forward in time using a 3rd-order Runge-Kutta method

$$
\begin{align}
S' & = S^t + \frac{1}{3} \Delta t M(S^t), \\
S'' & = S^t + \frac{1}{2} \Delta t M(S'), \\
S^{t+1} & = S^t + \Delta t M(S''), \\
\end{align}
$$

where $S^t$ is the model state at time $t$ and $M$ represents the model equations given by the approximations to $\frac{\paritial z}{\partial t}$, $\frac{\partial u}{\partial t}$, and $\frac{\partial v}{\partial t}$ above.  In this implementation, $\Delta t = \frac{1}{105}\mathrm{s}$.
