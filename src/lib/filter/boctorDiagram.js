import { placeSymbol, createNet, portPoints, label } from './schematic';
import { formatFarads, formatOhms } from './format';

export function buildBoctorDiagram(c, { ohms = formatOhms, highPass = false } = {}) {
	const net = createNet(), placed = [], labels = [];
	const at = (name, key, p, opts = {}) => {
		const ref = placeSymbol(name,0,0,48,opts).ports[key];
		const v = placeSymbol(name,p.x-ref.x,p.y-ref.y,48,opts); placed.push(v); return v;
	};
	const part = (key,a,b,vertical=false) => {
		const name=(key.startsWith('C')?'capacitor':'resistor')+(vertical?'_down':'_right');
		const v=at(name,'1',a); net.wire(v.ports['2'],b);
		labels.push(label(`${key} ${key.startsWith('C')?formatFarads(c[key]):ohms(c[key])}`,vertical?a.x-12:a.x,vertical?(a.y+v.ports['2'].y)/2+4:a.y-15,{anchor:vertical?'end':'start'}));
	};
	const ground=(p)=>at(p.y<200?'ground_up':'ground_down','1',p);
	const Vin={x:40,y:200}, O={x:740,y:200};
	if (!highPass) {
		const X={x:230,y:200}, P={x:470,y:200}, M={x:390,y:370};
		net.wire(Vin,{x:100,y:200});part('C2',{x:100,y:200},X);
		net.wire(X,{x:320,y:200});part('R6',{x:320,y:200},P);
		net.wire(P,{x:570,y:200});part('C1',{x:570,y:200},O);
		const u=at('opamp_no_power_right','inp2',{x:470,y:280},{flipY:true});net.wire(P,u.ports.inp2);
		net.elbow(u.ports.out,O,'h');net.elbow(M,u.ports.inp1,'v');
		for (const [key,n] of [['R2',X],['R1',P]]) {
			const top={x:n.x,y:100};ground({x:n.x,y:80});net.wire({x:n.x,y:80},top);part(key,top,n,true);
		}
		net.wire(X,{x:270,y:200});net.wire({x:270,y:200},{x:270,y:30});
		net.wire({x:270,y:30},{x:540,y:30});part('R4',{x:540,y:30},{x:740,y:30});net.wire({x:740,y:30},O);
		net.wire(Vin,{x:40,y:370});net.wire({x:40,y:370},{x:190,y:370});part('R3',{x:190,y:370},M);
		net.wire(M,{x:390,y:420});part('R5',{x:390,y:420},{x:390,y:510},true);ground({x:390,y:510});
	} else {
		const M={x:400,y:200}, P={x:400,y:370};
		net.wire(Vin,{x:100,y:200});part('C2',{x:100,y:200},{x:240,y:200});part('R2',{x:240,y:200},M);
		const u=at('opamp_no_power_right','inp2',{x:490,y:200},{flipY:true});net.wire(M,u.ports.inp2);net.elbow(u.ports.out,O,'h');
		net.elbow(P,u.ports.inp1,'h');
		ground({x:400,y:80});net.wire({x:400,y:80},{x:400,y:100});part('R4',{x:400,y:100},M,true);
		net.wire(M,{x:440,y:200});net.wire({x:440,y:200},{x:440,y:30});net.wire({x:440,y:30},{x:560,y:30});part('R5',{x:560,y:30},{x:740,y:30});net.wire({x:740,y:30},O);
		net.wire(Vin,{x:40,y:370});net.wire({x:40,y:370},{x:180,y:370});part('C1',{x:180,y:370},P);
		net.wire(P,{x:550,y:370});part('R3',{x:550,y:370},{x:740,y:370});net.wire({x:740,y:370},O);
		net.wire({x:40,y:370},{x:40,y:460});net.wire({x:40,y:460},{x:180,y:460});part('R1',{x:180,y:460},{x:400,y:460});net.wire({x:400,y:460},P);
		part('R6',{x:400,y:460},{x:400,y:550},true);ground({x:400,y:550});
	}
	labels.push(label('Vin',40,185),label('Vout',765,185));net.wire(O,{x:820,y:200});
	return {viewBox:'0 0 850 590',svg:placed.map(v=>v.svg).join('')+net.svg()+net.dots(portPoints(...placed))+labels.join('')};
}
