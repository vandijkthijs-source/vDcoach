import React,{useEffect,useMemo,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,Text,View} from 'react-native';
import {coachVisibleText,nextReveal} from '../lib/coach-presentation';
import {readableCoachText} from '../lib/coach-conversation';
export default function CoachReply({text,color,streaming,animate=false}:{text:string;color:string;streaming:boolean;animate?:boolean}){
 const headings=useMemo(()=>new Set(text.split(/\r?\n/).filter(line=>/^[ \t]*#{1,6}\s|^\*\*[^*]+\*\*$/.test(line.trim())).map(line=>readableCoachText(line))),[text]);
 const target=readableCoachText(coachVisibleText(text)),[shown,setShown]=useState(target),[reduced,setReduced]=useState(true),appear=useRef(new Animated.Value(1)).current;
 useEffect(()=>{if(!animate)return;let alive=true;void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(alive)setReduced(value)}).catch(()=>{});const listener=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);return()=>{alive=false;listener.remove()}},[animate]);
 useEffect(()=>{if(reduced||!animate){appear.setValue(1);return;}appear.setValue(0);const animation=Animated.timing(appear,{toValue:1,duration:260,useNativeDriver:true});animation.start();return()=>animation.stop()},[reduced,animate,appear]);
 useEffect(()=>{if(reduced||!animate){setShown(target);return;}const timer=setInterval(()=>setShown(current=>{const next=nextReveal(current,target);if(next===target)clearInterval(timer);return next}),35);return()=>clearInterval(timer)},[target,reduced,animate]);
 return <Animated.View accessibilityLiveRegion={streaming?'none':'polite'} style={{opacity:appear,gap:12,transform:[{translateY:appear.interpolate({inputRange:[0,1],outputRange:[6,0]})}]}}>{(shown||'Even nadenken…').split(/\n\s*\n/).map((paragraph,index)=><Text key={index} selectable accessibilityRole={headings.has(paragraph.trim())?'header':undefined} style={{color,fontSize:16,lineHeight:25,fontWeight:headings.has(paragraph.trim())?'600':'400'}}>{paragraph}</Text>)}</Animated.View>;
}
