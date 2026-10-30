import React,{useEffect,useRef,useState} from 'react';
import {Animated,Modal,PanResponder,Pressable,Text,View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {darkColors} from '../constants/theme';
import {ClockStage,clockSelection} from '../lib/clock';
type Props={label:string;value:string;onChange:(value:string)=>void;dark:boolean;disabled?:boolean;endOfDay?:boolean};
export default function ClockField({label,value,onChange,dark,disabled,endOfDay}:Props){
 const [open,setOpen]=useState(false),[stage,setStage]=useState<'hour'|'minute'>('hour');
 const [hour,setHour]=useState(0),[minute,setMinute]=useState(0);
 const current=useRef({hour,minute,stage});current.current={hour,minute,stage};
 const color=dark?darkColors.text:'#292e3b',muted=dark?darkColors.textMuted:'#778193',accent=dark?darkColors.accent:'#315df5';
 const pad=(n:number)=>String(n).padStart(2,'0');
 const dial=useRef<View>(null),face=useRef(new Animated.Value(1)).current;
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null),transition=useRef(false),sequence=useRef(0);
 type Gesture={stage:ClockStage;origin:{x:number;y:number;width:number;height:number}|null;last:{x:number;y:number};ended:boolean;finished:boolean;valid:boolean};
 const gesture=useRef<Gesture|null>(null);
 function cancelTransition(){if(timer.current)clearTimeout(timer.current);timer.current=null;sequence.current++;transition.current=false;face.stopAnimation();face.setValue(1);}
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);sequence.current++;face.stopAnimation();},[]);
 function switchStage(next:ClockStage){cancelTransition();if(current.current.stage===next)return;const seq=sequence.current;transition.current=true;Animated.timing(face,{toValue:0,duration:100,useNativeDriver:true}).start(({finished})=>{if(!finished||sequence.current!==seq)return;current.current.stage=next;setStage(next);Animated.timing(face,{toValue:1,duration:160,useNativeDriver:true}).start(()=>{if(sequence.current===seq)transition.current=false;});});}
 function apply(g:Gesture){if(!g.origin)return;const {x,y,width,height}=g.origin;const selected=clockSelection((g.last.x-x)*280/width,(g.last.y-y)*280/height,g.stage);if(selected===null)return;g.valid=true;if(g.stage==='hour'){current.current.hour=selected;setHour(selected);}else{current.current.minute=selected;setMinute(selected);}}
 function finish(g:Gesture){if(g.finished)return;g.finished=true;if(g.valid&&g.stage==='hour'){timer.current=setTimeout(()=>{timer.current=null;switchStage('minute');},180);}}
 function close(){cancelTransition();gesture.current=null;setOpen(false);}
 const pan=useRef(PanResponder.create({
  onStartShouldSetPanResponder:()=>!transition.current,
  onMoveShouldSetPanResponder:()=>!transition.current,
  onPanResponderGrant:e=>{cancelTransition();const g:Gesture={stage:current.current.stage,origin:null,last:{x:e.nativeEvent.pageX,y:e.nativeEvent.pageY},ended:false,finished:false,valid:false};gesture.current=g;dial.current?.measureInWindow((x,y,width,height)=>{if(gesture.current!==g||width<=0||height<=0)return;g.origin={x,y,width,height};apply(g);if(g.ended)finish(g);});},
  onPanResponderMove:e=>{const g=gesture.current;if(!g||g.ended)return;g.last={x:e.nativeEvent.pageX,y:e.nativeEvent.pageY};apply(g);},
  onPanResponderRelease:e=>{const g=gesture.current;if(!g)return;g.last={x:e.nativeEvent.pageX,y:e.nativeEvent.pageY};g.ended=true;apply(g);if(g.origin)finish(g);},
  onPanResponderTerminate:()=>{gesture.current=null;cancelTransition();},
  onPanResponderTerminationRequest:()=>false,
 })).current;
 const angle=(stage==='hour'?hour%12/12:minute/60)*Math.PI*2,radius=stage==='hour'&&(hour===0||hour>12)?65:110;
 return <><Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={()=>{cancelTransition();gesture.current=null;setHour(Number(value.slice(0,2))%24);setMinute(Number(value.slice(3,5)));setStage('hour');setOpen(true);}} style={{flex:1,borderWidth:1,borderColor:dark?darkColors.border:'#dce1eb',borderRadius:9,padding:10,backgroundColor:dark?darkColors.input:'#fff'}}><Text style={{color:muted,fontSize:11,marginBottom:5}}>{label}</Text><View style={{flexDirection:'row',alignItems:'center',gap:8}}><Ionicons name="time-outline" size={18} color={accent}/><Text style={{color,fontSize:18}}>{value==='24:00'?'00:00':value}</Text></View>{value==='24:00'&&<Text style={{color:muted,fontSize:10}}>volgende dag</Text>}</Pressable>
 <Modal visible={open} transparent animationType="fade" onRequestClose={close}><View style={{flex:1,justifyContent:'center',alignItems:'center',backgroundColor:'#0008',padding:8}}><View style={{width:'100%',maxWidth:340,padding:12,borderRadius:22,backgroundColor:dark?darkColors.panel:'#fff',gap:16}}><Text style={{color:muted,fontSize:13}}>{label}</Text><View style={{flexDirection:'row',justifyContent:'center',alignItems:'center',gap:10}}><Pressable accessibilityRole="button" accessibilityLabel="Uren kiezen" onPress={()=>switchStage('hour')}><Text style={{fontSize:42,color:stage==='hour'?accent:color}}>{pad(hour)}</Text></Pressable><Text style={{fontSize:36,color:muted}}>:</Text><Pressable accessibilityRole="button" accessibilityLabel="Minuten kiezen" onPress={()=>switchStage('minute')}><Text style={{fontSize:42,color:stage==='minute'?accent:color}}>{pad(minute)}</Text></Pressable></View>
 <View ref={dial} collapsable={false} {...pan.panHandlers} accessibilityLabel={stage==='hour'?'Kies het uur op de klok':'Kies de minuten op de klok'} style={{width:280,height:280,alignSelf:'center',borderRadius:140,backgroundColor:dark?darkColors.panelStrong:'#f0f3f8'}}><Animated.View pointerEvents="none" style={{width:280,height:280,opacity:face}}><View pointerEvents="none" style={{position:'absolute',left:138,top:140,width:2,height:radius,backgroundColor:accent,transformOrigin:'top',transform:[{rotate:`${180+angle*180/Math.PI}deg`}]}}/><View pointerEvents="none" style={{position:'absolute',left:140+Math.sin(angle)*radius-18,top:140-Math.cos(angle)*radius-18,width:36,height:36,borderRadius:18,backgroundColor:dark?darkColors.accentSoft:'#dce8ff'}}/>{Array.from({length:stage==='hour'?24:12},(_,i)=>{const inner=stage==='hour'&&i>=12,n=stage==='hour'?(inner?(i===12?0:i):i===0?12:i):i*5,a=(i%12)/12*Math.PI*2,r=inner?65:110;return <Text selectable={false} key={i} pointerEvents="none" style={{position:'absolute',left:140+Math.sin(a)*r-17,top:140-Math.cos(a)*r-12,width:34,textAlign:'center',fontSize:inner?12:16,color}}>{stage==='minute'?pad(n):n}</Text>;})}<View pointerEvents="none" style={{position:'absolute',left:137,top:137,width:6,height:6,borderRadius:3,backgroundColor:accent}}/></Animated.View></View>
 <View style={{flexDirection:'row',justifyContent:'flex-end',gap:24}}><Pressable accessibilityRole="button" accessibilityLabel="Annuleer tijd" onPress={close} style={{padding:8}}><Text style={{color:muted}}>Annuleren</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Bevestig tijd" onPress={()=>{onChange(endOfDay&&hour===0&&minute===0?'24:00':`${pad(hour)}:${pad(minute)}`);close();}} style={{padding:8}}><Text style={{color:accent,fontWeight:'600'}}>Klaar</Text></Pressable></View></View></View></Modal></>;
}
