import React from 'react';
import {requireNativeComponent,UIManager,ViewProps} from 'react-native';
import Fallback,{ParticleFieldProps} from './CoachParticleFallback';
let NativeField:React.ComponentType<ViewProps&ParticleFieldProps>|null=null;
try{if(UIManager.getViewManagerConfig('CoachBoids'))NativeField=requireNativeComponent('CoachBoids')}catch{/* Older app binary: use a safe static fallback. */}
export default function CoachParticleField(props:ParticleFieldProps){return NativeField?<NativeField {...props} style={{width:300,height:220}}/>:<Fallback {...props}/>}
