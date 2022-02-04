let rnnoiseExports = null;
let heapFloat32;
let processCount = 0;
console.log('Processor loaded 2');
class RNNNoiseProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super(Object.assign(Object.assign({}, options), { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] }));
        if (!rnnoiseExports) {
            // @ts-ignore
            rnnoiseExports = new WebAssembly.Instance(options.processorOptions.module).exports;
            // @ts-ignore
            heapFloat32 = new Float32Array(rnnoiseExports.memory.buffer);
        }
        if (options.processorOptions.activeInitially) {
            console.log('processor activeInitially');
            this.state = rnnoiseExports.newState();
        }
        else {
            console.log('processor NOT activeInitially');
            this.state = null;
        }
        this.port.onmessage = ({ data: keepalive }) => {
            let vadProb = 0;
            if (keepalive) {
                if (this.state === null) {
                    console.log('processor creating state again');
                    this.state = rnnoiseExports.newState();
                }
                vadProb = rnnoiseExports.getVadProb(this.state);
            }
            else if (this.state) {
                console.log('processor deleting state');
                rnnoiseExports.deleteState(this.state);
                this.state = null;
            }
            this.port.postMessage({ vadProb, isActive: this.state !== null });
        };
    }
    process(inputs, outputs, parameters) {
        if (this.state) {
            heapFloat32.set(inputs[0][0], rnnoiseExports.getInput(this.state) / 4);
            const o = outputs[0][0];
            const ptr4 = rnnoiseExports.pipe(this.state, o.length) / 4;
            if (ptr4) {
                o.set(heapFloat32.subarray(ptr4, ptr4 + o.length));
            }
        }
        else {
            // rnnoise is turned off.
            if (inputs[0] && inputs[0][0]) {
                outputs[0][0].set(inputs[0][0]);
            }
            else {
                console.warn('got invalid inputs, happens when source is disconnected :', inputs);
                // TODO: add a message that tells RNNNoiseProcessor of being disconnected.
                return false;
            }
        }
        processCount++;
        if (processCount % 111 === 0) {
            console.log(`${processCount}: RNNoise ${this.state ? 'enabled' : 'disabled'}`);
        }
        return true;
    }
}
registerProcessor('rnnoise', RNNNoiseProcessor);
