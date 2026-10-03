// Which embedded simulation is running. Each one is a whole simulator in
// an iframe, so starting one stops the one before it: the page never runs
// more than one at a time, whatever the number of circuits it shows.
export const sims = $state({ active: null });
