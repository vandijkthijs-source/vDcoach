const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
// RemoteViews rejects ordinary View at launcher inflation time, even though aapt compiles it.
// Android's supported widget types: https://developer.android.com/reference/android/widget/RemoteViews
const allowed=new Set(['LinearLayout','FrameLayout','RelativeLayout','GridLayout','ListView','GridView','StackView','ViewFlipper','AdapterViewFlipper','TextView','Button','ImageView','ImageButton','ProgressBar','Chronometer','AnalogClock','TextClock','ViewStub','CheckBox','Switch','RadioButton','RadioGroup']);
const root=path.join(__dirname,'../android/app/src/main/res');
for(const folder of fs.readdirSync(root).filter(n=>n==='layout'||n.startsWith('layout-'))){for(const file of fs.readdirSync(path.join(root,folder)).filter(n=>n.startsWith('widget_')&&n.endsWith('.xml'))){test(`RemoteViews can inflate every element in ${folder}/${file}`,()=>{const xml=fs.readFileSync(path.join(root,folder,file),'utf8');for(const [,tag] of xml.matchAll(/<([A-Za-z][\w.]*)\b/g))assert.ok(allowed.has(tag),`Unsupported RemoteViews element: ${tag}`);});}}
