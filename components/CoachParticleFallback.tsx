import React from 'react';
import {View} from 'react-native';
import {coachParticles} from '../lib/coach-particles';
export type ParticleFieldProps={mode:number;dark:boolean;paused:boolean;impulse:number};
/** Safe fallback for old native builds; the current Android build uses its Canvas view. */
export default function CoachParticleField({dark}:ParticleFieldProps){return <View style={{width:300,height:220}}>{coachParticles(120).map((p,i)=><View key={i} style={{position:'absolute',left:p.x,top:p.y,width:p.size,height:p.size,borderRadius:p.size/2,opacity:p.opacity,backgroundColor:dark?'#c5dbe2':'#668b9d'}}/>)}</View>}
