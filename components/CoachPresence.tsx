import CoachParticleField from './CoachParticleField';
import React,{useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,AppState,View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
type Props={thinking?:boolean;dark?:boolean;saved?:number;calendarSaved?:boolean;typingText?:string;replyText?:string;replying?:boolean};
/** One Canvas flock; no per-dot React renders or Animated-node graphs. */
export default function CoachPresence({thinking=false,dark=false,saved=0,calendarSaved=false,typingText='',replyText='',replying=false}:Props){
 const [reduced,setReduced]=useState(true),[active,setActive]=useState(AppState.currentState==='active'),[showSaved,setShowSaved]=useState(false),[impulse,setImpulse]=useState(0),[typingRecent,setTypingRecent]=useState(false);
 const previous=useRef({typingText,replyText});
 useEffect(()=>{if(!typingText){setTypingRecent(false);return;}setTypingRecent(true);const timer=setTimeout(()=>setTypingRecent(false),700);return()=>clearTimeout(timer)},[typingText]);
 useEffect(()=>{let alive=true;void AccessibilityInfo.isReduceMotionEnabled().then(v=>{if(alive)setReduced(v)}).catch(()=>{});const motion=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced),app=AppState.addEventListener('change',s=>setActive(s==='active'));return()=>{alive=false;motion.remove();app.remove()}},[]);
 useEffect(()=>{const changed=previous.current.typingText!==typingText||previous.current.replyText!==replyText;previous.current={typingText,replyText};if(changed&&!reduced&&active)setImpulse(v=>(v+1)%1000000)},[typingText,replyText,reduced,active]);
 useEffect(()=>{if(!saved){setShowSaved(false);return;}setShowSaved(true);if(!reduced&&active)setImpulse(v=>(v+1)%1000000);const timer=setTimeout(()=>setShowSaved(false),3100);return()=>clearTimeout(timer)},[saved,reduced,active]);
 return <View accessible accessibilityRole="image" accessibilityLabel={showSaved?(calendarSaved?'Agendawijziging opgeslagen':'Wijzigingen opgeslagen'):thinking?'Je coach reageert met een bewegende zwerm':typingRecent?'De zwerm reageert op je invoer':'Een zwevende zwerm van 480 deeltjes'} style={{width:300,height:220,alignItems:'center'}}>
  <CoachParticleField mode={replying?3:thinking?2:typingRecent?1:0} dark={dark} paused={reduced||!active} impulse={impulse}/>
  {showSaved&&<View style={{position:'absolute',bottom:9,alignItems:'center'}}><Ionicons name="checkmark" size={19} color={dark?'#b8d5cc':'#598571'}/></View>}
 </View>
}
