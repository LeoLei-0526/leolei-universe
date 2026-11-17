/* Spiral placement adapted from cpl121/create-your-galaxy, MIT.
 * Full notices: vendor/GALAXY-LICENSE.txt and vendor/THREE-LICENSE.txt.
 * All imagery is generated here; no third-party galaxy models or textures.
 */
(() => {
  'use strict';
  const $=s=>document.querySelector(s),T=THREE;
  const mobile=innerWidth<650,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let renderer;
  try{renderer=new T.WebGLRenderer({antialias:false,powerPreference:'high-performance'});}
  catch(e){$('#loading').hidden=true;$('#error').hidden=false;return;}
  const host=$('#universe');host.appendChild(renderer.domElement);
  renderer.setClearColor(0x000000,1);
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(44,innerWidth/innerHeight,.1,240);
  const galaxy=new T.Group();galaxy.name='shared-nebula';galaxy.rotation.z=-.13;scene.add(galaxy);
  const worldScale=1.25;galaxy.scale.setScalar(worldScale);
  const atmosphere=new T.Group();atmosphere.name='ambient-clouds';galaxy.add(atmosphere);
  const U={uTime:{value:0},uOrbit:{value:0},uPixel:{value:1},uBrightness:{value:.9},uMist:{value:.9},uWarmth:{value:.55},uEmphasis:{value:1},uViewDistance:{value:25}};
  let seed=192837;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const normal=()=>Math.sqrt(-2*Math.log(Math.max(rand(),.000001)))*Math.cos(6.283185*rand());
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  const sceneSettings=window.PORTFOLIO_DATA?.scene||{depth:1.7,rotationMinutes:25,autoRotate:true};
  const thickness=sceneSettings.depth;
  const mix=(a,b,t)=>a+(b-a)*t;
  const colors=[[1,.50,.16],[.60,.23,.44],[.18,.34,.70]];
  function tintAt(r){const t=clamp(r/13,0,1),i=t<.42?0:1,f=i===0?t/.42:(t-.42)/.58;return colors[i].map((v,j)=>mix(v,colors[i+1][j],f));}
  // One shared Gaussian sprite for all fine dust. Bake once; keep bright stars analytic.
  const spriteSize=128,spritePixels=new Uint8Array(spriteSize*spriteSize*4);
  for(let y=0;y<spriteSize;y++)for(let x=0;x<spriteSize;x++){
    const dx=(x+.5)/spriteSize-.5,dy=(y+.5)/spriteSize-.5,k=(y*spriteSize+x)*4;
    spritePixels[k]=spritePixels[k+1]=spritePixels[k+2]=255;
    spritePixels[k+3]=Math.round(255*Math.exp(-18*(dx*dx+dy*dy)));
  }
  const dustSprite=new T.DataTexture(spritePixels,spriteSize,spriteSize,T.RGBAFormat);
  dustSprite.minFilter=dustSprite.magFilter=T.LinearFilter;dustSprite.generateMipmaps=false;dustSprite.needsUpdate=true;
  U.uDustMap={value:dustSprite};
  const vertex=`attribute vec3 tint;attribute float size;attribute float opacity;attribute float phase;
    uniform float uPixel;uniform float uTime;uniform float uOrbit;uniform float uEmphasis;varying vec3 vTint;varying float vOpacity;varying float vDiameter;varying float vCore;varying float vDustScale;
    void main(){vec3 point=position;
      #ifdef ORBITAL
        // Softened, approximately flat rotation curve. Time is artistically accelerated.
        // Only decorative stars orbit; project markers retain their authored positions.
        vec2 radial=point.xz-vec2(.4,-.1);float r=length(radial);
        float angle=uOrbit*.055/sqrt(r*r+9.);
        float cs=cos(angle),sn=sin(angle);
        point.xz=vec2(cs*radial.x+sn*radial.y,-sn*radial.x+cs*radial.y)+vec2(.4,-.1);
      #endif
      vec4 mv=modelViewMatrix*vec4(point,1.);vTint=tint;
      vOpacity=opacity*uEmphasis*smoothstep(.25,1.4,-mv.z);
      gl_Position=projectionMatrix*mv;
      float depth=max(.6,-mv.z);
      #ifdef DUST
        vCore=clamp(size*pow(23./depth,.28),.19,.62);
        gl_PointSize=max(2.,vCore*6.)*uPixel;
        float variance=vCore*vCore+.07/(uPixel*uPixel);
        vDustScale=(gl_PointSize/uPixel)/(6.*sqrt(variance));
        vOpacity*=vCore*vCore/variance;
        vOpacity*=mix(.28,1.,smoothstep(2.,20.,depth));
      #elif defined(LUMINOUS)
        gl_PointSize=clamp(size*pow(23./depth,.38),4.,36.)*uPixel;
      #else
        gl_PointSize=clamp(size*23./depth,.7,112.)*uPixel;
      #endif
      vDiameter=gl_PointSize/uPixel;}`;
  const starFrag=`precision highp float;uniform float uBrightness;uniform float uWarmth;uniform sampler2D uDustMap;
    varying vec3 vTint;varying float vOpacity;varying float vDustScale;
    void main(){vec2 uv=(gl_PointCoord-.5)*vDustScale+.5;
      float core=texture2D(uDustMap,uv).a;
      vec3 c=vTint;c.r*=.82+uWarmth*.34;
      gl_FragColor=vec4(mix(c,vec3(1.,.97,.94),.16),core*vOpacity*uBrightness);}`;
  const glowFrag=`precision highp float;uniform float uBrightness;varying vec3 vTint;varying float vOpacity;
    void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;
      float core=exp(-d*d*480.);
      float shoulder=exp(-d*d*65.);
      float halo=exp(-d*d*7.)*(1.-smoothstep(.65,1.,d));
      vec3 light=mix(vTint,vec3(1.),.88)*core*5.5+vTint*(shoulder*.40+halo*.045);
      gl_FragColor=vec4(light,vOpacity*uBrightness);}`;
  const fogFrag=`precision highp float;uniform float uMist;uniform float uWarmth;
    varying vec3 vTint;varying float vOpacity;
    void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;
      vec3 c=vTint;c.r*=.82+uWarmth*.34;
      gl_FragColor=vec4(c,exp(-d*d*5.)*(1.-smoothstep(.65,1.,d))*vOpacity*uMist);}`;
  function makePoints(pos,col,size,alpha,phase,frag,parent=galaxy,twinkle=false,orbital=false){
    const g=new T.BufferGeometry();
    for(const [k,v,n] of [['position',pos,3],['tint',col,3],['size',size,1],['opacity',alpha,1],['phase',phase,1]])g.setAttribute(k,new T.BufferAttribute(new Float32Array(v),n));
    let vs=twinkle?vertex.replace('vOpacity=opacity*','vOpacity=opacity*(.91+.09*sin(uTime*.5+phase))*'):vertex;
    const defines=frag===starFrag?{DUST:1}:frag===glowFrag?{LUMINOUS:1}:{};
    if(orbital)defines.ORBITAL=1;
    const mat=new T.ShaderMaterial({defines,uniforms:{...U,uEmphasis:{value:1}},vertexShader:vs,fragmentShader:frag,extensions:{derivatives:true},transparent:true,depthWrite:false,depthTest:false,blending:T.AdditiveBlending});
    const points=new T.Points(g,mat);points.frustumCulled=false;parent.add(points);return points;
  }
  function cloud(n,kind,region){
    const p=[],c=[],s=[],a=[],ph=[];
    for(let i=0;i<n;i++){
      let x,y,z,r;
      if(rand()<.065){x=normal()*.65;z=normal()*.53;y=normal()*.40*thickness;r=Math.hypot(x,z);}
      else{
        // A smooth radial envelope makes one coherent, gently rounded silhouette.
        r=Math.sqrt(-2*Math.log(1-rand()*.985))*region.radius*.36;
        const diffuse=rand()<.52;
        const angle=diffuse?rand()*Math.PI*2:(i%2)*Math.PI+.35+Math.log(1+r*.55)*2.3+normal()*(.24+.025*r);
        const jitter=.06+r*.035;
        x=Math.cos(angle)*r+normal()*jitter;z=Math.sin(angle)*r+normal()*jitter;
        // Bulging, warped clouds have volume above and below each local star field.
        const bulge=.30+.72*Math.exp(-r*r/(region.radius*region.radius*.42));
        y=(normal()*bulge+Math.sin(x*.5+z*.3)*.30)*thickness*(kind==='fog'?1.3:1);
      }
      const rz=z*region.flatten,cs=Math.cos(region.angle),sn=Math.sin(region.angle);
      p.push(region.position[0]+x*cs-rz*sn,region.position[1]+y,region.position[2]+x*sn+rz*cs);
      let rgb=tintAt(r);
      if(kind==='bright'){
        const palette=[[.65,.69,1],[.51,.76,1],[.87,.59,.81],[.83,.87,1],[1,.79,.49]];
        rgb=palette[Math.floor(rand()*palette.length)];const power=Math.pow(rand(),5);
        s.push(5+power*23);a.push((.10+power*1.5)*(.55+.45*clamp(r/2,0,1)));
      }else if(kind==='fog'){
        s.push(90+rand()*100);a.push(.032*(.4+.6*clamp(r/2,0,1))*Math.exp(-y*y/(thickness*thickness*1.8)));
      }else{
        if(rand()<.08)rgb=i%2===0?[.66,.35,.57]:[.85,.62,.40];
        const variation=.65+rand()*.65;rgb=rgb.map(v=>v*variation);
        const power=Math.pow(rand(),4);
        const lane=.5+.5*Math.pow(.5+.5*Math.sin(x*.45+z*.3+Math.sin(z*.4)),2);
        s.push(.20+power*.30);a.push((.045+power*.75)*lane*(1+.5*Math.exp(-r*r/2.1))*.78);
      }
      c.push(...rgb);ph.push(rand()*6.28);
    }
    const points=makePoints(p,c,s,a,ph,kind==='fog'?fogFrag:kind==='bright'?glowFrag:starFrag,kind==='fog'?atmosphere:galaxy,false,true);points.name='unified-'+kind;return points;
  }
  // Render to floating-point light buffers so many faint particles accumulate smoothly.
  const hdr=renderer.capabilities.isWebGL2&&renderer.extensions.has('EXT_color_buffer_float');
  const opts={type:hdr?T.HalfFloatType:T.UnsignedByteType,minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:false};
  const light=new T.WebGLRenderTarget(1,1,opts);
  const postScene=new T.Scene(),postCamera=new T.OrthographicCamera(-1,1,1,-1,0,1);
  const postVertex='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
  // Each luminous star carries its own halo; no full-frame blur is needed.
  const finalMat=new T.ShaderMaterial({uniforms:{source:{value:light.texture}},vertexShader:postVertex,fragmentShader:`varying vec2 vUv;uniform sampler2D source;
    void main(){vec3 c=texture2D(source,vUv).rgb;
      c=1.-exp(-c*1.05);c=pow(max(c,vec3(0.)),vec3(.82));
      float vig=1.-.19*smoothstep(.25,.8,length(vUv-.5));gl_FragColor=vec4(c*vig,1.);}`});
  const quad=new T.Mesh(new T.PlaneGeometry(2,2),finalMat);postScene.add(quad);
  const veilMat=new T.ShaderMaterial({uniforms:U,transparent:true,depthWrite:false,depthTest:false,blending:T.AdditiveBlending,side:T.DoubleSide,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec2 vUv;uniform float uMist;uniform float uEmphasis;uniform float uViewDistance;void main(){vec2 p=(vUv-.5)*2.;float d=length(p);
      float nearFade=mix(.30,1.,smoothstep(4.,16.,uViewDistance));
      float a=(exp(-d*d*5.)*.25+exp(-d*d*80.)*.65)*(1.-smoothstep(.55,1.,d))*uMist*uEmphasis*nearFade;
      vec3 c=mix(vec3(1.,.43,.12),vec3(.25,.14,.41),smoothstep(.03,.55,d));gl_FragColor=vec4(c,a);}`});
  // Categories are navigable regions inside one cloud, not three competing bright cores.
  const wholeCloud={position:[.4,.2,-.1],radius:13,flatten:.94,angle:0};
  const veil=new T.Mesh(new T.PlaneGeometry(32,30),veilMat);veil.name='unified-core';veil.rotation.x=-Math.PI/2;veil.position.set(...wholeCloud.position);galaxy.add(veil);
  cloud(mobile?360:700,'fog',wholeCloud);cloud(mobile?104000:208000,'dust',wholeCloud);cloud(mobile?1900:4200,'bright',wholeCloud);
  // One enclosing cloud shares the same center and radial color gradient.
  // A procedural veil supplies low-frequency color; crisp dust stays a separate layer.
  const nebulaMat=new T.ShaderMaterial({uniforms:U,transparent:true,depthWrite:false,depthTest:false,blending:T.AdditiveBlending,side:T.DoubleSide,
    vertexShader:veilMat.vertexShader,
    fragmentShader:`varying vec2 vUv;uniform float uMist;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
      float fbm(vec2 p){float a=.5,v=0.;for(int i=0;i<5;i++){v+=a*noise(p);p=mat2(.8,-.6,.6,.8)*p*2.03+7.1;a*=.5;}return v;}
      void main(){vec2 p=(vUv-.5)*2.;float r=length(p);float n=fbm(p*4.5+2.7);
        float envelope=exp(-r*r*3.2)*(1.-smoothstep(.70,1.,r+(n-.5)*.04));
        float structure=smoothstep(.23,.78,n);
        float a=envelope*(.12+.18*structure)*uMist;
        vec3 blue=vec3(.16,.26,.56),rose=vec3(.52,.20,.39),gold=vec3(.90,.40,.13);
        vec3 c=mix(gold,rose,smoothstep(.03,.38,r));c=mix(c,blue,smoothstep(.30,.85,r));
        gl_FragColor=vec4(c,a);}`});
  const nebulaVeil=new T.Mesh(new T.PlaneGeometry(36,30),nebulaMat);
  nebulaVeil.rotation.x=-Math.PI/2;nebulaVeil.position.set(.4,-.4,-.1);atmosphere.add(nebulaVeil);
  // Bake expensive fractal cloud noise once, then sample a small texture while zooming.
  const nebulaTexture=new T.WebGLRenderTarget(768,768,opts),bakeScene=new T.Scene();
  const bakeMat=nebulaMat.clone();bakeMat.uniforms={uMist:{value:1}};bakeMat.blending=T.NoBlending;bakeMat.transparent=false;
  const bakeQuad=new T.Mesh(new T.PlaneGeometry(2,2),bakeMat);bakeScene.add(bakeQuad);
  renderer.setRenderTarget(nebulaTexture);renderer.render(bakeScene,postCamera);renderer.setRenderTarget(null);
  bakeMat.dispose();bakeQuad.geometry.dispose();
  nebulaMat.uniforms={...U,uNebula:{value:nebulaTexture.texture}};
  nebulaMat.fragmentShader='varying vec2 vUv;uniform sampler2D uNebula;uniform float uMist;void main(){vec4 cloud=texture2D(uNebula,vUv);gl_FragColor=vec4(cloud.rgb,cloud.a*uMist);}';
  {const p=[],c=[],s=[],a=[],ph=[];
    for(let i=0;i<(mobile?10000:22000);i++){
      const r=Math.sqrt(-2*Math.log(1-rand()*.99))*5.4,angle=rand()*Math.PI*2;
      const x=Math.cos(angle)*r,z=Math.sin(angle)*r*.94,envelope=Math.exp(-r*r/150);
      const height=(normal()*(.45+1.35*envelope)+Math.sin(x*.26)*.25)*thickness;
      p.push(x+.4,height,z-.1);c.push(...tintAt(r));
      s.push(.2+Math.pow(rand(),4)*.25);a.push((.03+Math.pow(rand(),4)*.25)*envelope);ph.push(rand()*6.28);
    }makePoints(p,c,s,a,ph,starFrag,galaxy,false,true);
  }
  // Soft particles occupy a 3D ellipsoid, not a stack of flat camera-facing sheets.
  {const p=[],c=[],s=[],a=[],ph=[];
    for(let i=0;i<(mobile?160:300);i++){
      const x=normal()*4.9,z=normal()*4.9*.94,y=(normal()*.95+Math.sin(x*.35)*.2)*thickness;
      const density=Math.exp(-(x*x+z*z)/140-y*y/12);
      p.push(x+.4,y,z-.1);c.push(...tintAt(Math.hypot(x,z)));
      s.push(110+rand()*100);a.push(.018*density);ph.push(rand()*6.28);
    }makePoints(p,c,s,a,ph,fogFrag,atmosphere,false,true);
  }
  // A sparse shared field adds depth without inventing a fourth galactic core.
  const p=[],c=[],s=[],a=[],ph=[];
  for(let i=0;i<1600;i++){
    p.push((rand()-.5)*95,(rand()-.5)*60,(rand()-.5)*90);
    c.push(...[[.47,.55,.7],[.62,.37,.65],[.82,.71,.55]][i%3]);s.push(rand()<.025?12+rand()*10:2+rand()*4);a.push(.2+rand()*.45);ph.push(rand()*6.28);
  }
  makePoints(p,c,s,a,ph,glowFrag,scene,true);
  // Extend the same galaxy with sparse spiral outskirts and a deeper stellar halo.
  // Separate seeded generation preserves every existing star and authored content anchor.
  const savedSeed=seed;seed=741892;
  const outerCount=mobile?110000:390000;
  {const p=[],c=[],s=[],a=[],ph=[];
    for(let i=0;i<outerCount;i++){
      const r=4+Math.pow(rand(),.68)*22,arm=i%2;
      const diffuse=rand()<.28;
      const angle=diffuse?rand()*Math.PI*2:arm*Math.PI+.35+Math.log(1+r*.55)*2.3+normal()*(.10+.006*r);
      const x=Math.cos(angle)*r,z=Math.sin(angle)*r*.86;
      const y=(normal()*(.32+.025*r)+Math.sin(angle*2+r*.18)*.35)*thickness;
      p.push(x+.4,y,z-.1);
      const t=clamp((r-4)/22,0,1),fade=Math.pow(1-t,1.15),power=Math.pow(rand(),4);
      const tint=tintAt(Math.min(13,6+r*.4));
      c.push(...tint.map((v,j)=>mix(v,[.53,.64,.91][j],.32+rand()*.2)));
      s.push(.20+power*.27);a.push((.055+power*.65)*fade*(diffuse?.48:1)*.80);ph.push(rand()*6.28);
    }
    const outskirts=makePoints(p,c,s,a,ph,starFrag,galaxy,false,true);outskirts.name='extended-spiral-dust';
  }
  {const p=[],c=[],s=[],a=[],ph=[];
    for(let i=0;i<(mobile?18000:48000);i++){
      const r=35+rand()*65,az=rand()*Math.PI*2,h=rand()*2-1,q=Math.sqrt(1-h*h);
      p.push(Math.cos(az)*q*r,h*r*.65,Math.sin(az)*q*r);
      c.push(.62,.71,.94);s.push(.25+Math.pow(rand(),4)*.36);a.push(.12+Math.pow(rand(),3)*.65);ph.push(0);
    }
    const distant=makePoints(p,c,s,a,ph,starFrag,scene);distant.name='distant-starfield';
  }
  seed=savedSeed;
  const stars=(window.GALAXY_CONTENT?.stars||[
    {name:'微光',position:new T.Vector3(-3.2,.25,2.2),color:[.65,.62,1]},
    {name:'回声',position:new T.Vector3(4.4,.3,.8),color:[.44,.72,1]},
    {name:'远方',position:new T.Vector3(1.8,.2,-4.2),color:[1,.54,.74]},
    {name:'初见',position:new T.Vector3(-5.4,.12,-1.5),color:[1,.79,.50]}
  ]).map(star=>({...star,position:Array.isArray(star.position)?new T.Vector3(...star.position):star.position}));
  const projectLights=makePoints(stars.flatMap(s=>s.position.toArray()),stars.flatMap(s=>s.color),stars.map(()=>23),stars.map(()=>.9),stars.map((_,i)=>i),glowFrag);
  const heartPosition=new T.Vector3(.4,.3,-.1);
  makePoints(heartPosition.toArray(),[1,.76,.43],[54],[1.1],[0],glowFrag);
  let heartOpen=false,beforeHeart=null;
  let hovered=-1,selected=-1,spin=0,paused=reduced,elapsed=0,last=performance.now(),frames=0,flight=null,visible=true;
  const rotationSpeed=Math.PI*2/(sceneSettings.rotationMinutes*60);
  let motionHoldUntil=0,rotationMoving=false;
  function holdMotion(){motionHoldUntil=performance.now()+6000;}
  // Stop immediately when aiming; the same transform drives particles and hit targets.
  document.addEventListener('pointerdown',holdMotion,true);
  document.addEventListener('wheel',holdMotion,{capture:true,passive:true});
  document.addEventListener('keydown',holdMotion,true);
  const home=()=>({yaw:0,pitch:.58,distance:innerWidth<650?42:23,pivot:new T.Vector3(0,0,1.3)});
  const overview=()=>({...home(),distance:innerWidth<650?86:56});
  const clone=v=>({...v,pivot:v.pivot.clone()});
  let view=home(),target=clone(view),beforeFocus=null;
  const regions=window.GALAXY_CONTENT.regions.map(r=>({...r,position:new T.Vector3(...r.position)}));
  let activeRegion=-1,beforeRegion=null,zoomOrigin=null;
  const velocity={x:0,y:0},cursor={x:0,y:0},parallax={x:0,y:0},pointers=new Map();let drag=null,pinch=0;
  const projected=new T.Vector3(),world=new T.Vector3(),raycaster=new T.Raycaster();
  const markerLayer=$('#star-targets'),tooltip=$('#star-tooltip');
  stars.forEach((star,i)=>{
    const b=document.createElement('button');b.className='star-target';b.setAttribute('aria-label',`查看项目：${star.name}`);b.innerHTML='<span></span>';
    const label=document.createElement('em'),name=document.createElement('strong'),kind=document.createElement('small'),preview=document.createElement('small');
    name.textContent=star.name;kind.textContent=star.kind;preview.className='star-preview';preview.textContent=star.summary;
    const action=document.createElement('b');action.textContent='查看项目 ↗';preview.appendChild(action);label.append(name,kind,preview);b.appendChild(label);markerLayer.appendChild(b);star.button=b;
    b.onpointerenter=()=>showHover(i);b.onpointerleave=()=>showHover(-1);b.onfocus=()=>showHover(i);b.onblur=()=>showHover(-1);b.onclick=()=>focusStar(i);
    b.onwheel=onWheel;
  });
  function showHover(i){hovered=i;tooltip.hidden=true;const alpha=projectLights.geometry.attributes.opacity;stars.forEach((s,j)=>alpha.setX(j,j===i?1.55:.9));alpha.needsUpdate=true;}
  regions.forEach((r,i)=>{const b=document.createElement('button');b.className='region-target';const number=document.createElement('small'),title=document.createElement('strong'),detail=document.createElement('span');number.textContent=String(i+1).padStart(2,'0');title.textContent=r.name;const count=stars.filter(s=>s.region===i).length;detail.textContent=count?count+' 件作品 · 靠近探索':'创作区域 · 待加入作品';b.append(number,title,detail);b.setAttribute('aria-label','进入'+r.name+'星系');b.onclick=()=>enterRegion(i);b.addEventListener('wheel',onWheel,{passive:false});$('#region-targets').appendChild(b);r.button=b;});
  function regionView(i){galaxy.updateMatrixWorld(true);const center=galaxy.localToWorld(regions[i].position.clone());
    // Offset the camera target to leave a quiet introduction column beside the content.
    if(i===0){center.x+=(innerWidth<650?.5:-1.05)*worldScale;center.z+=(innerWidth<650?-1.0:0)*worldScale;}
    return {yaw:0,pitch:.58,distance:(innerWidth<650?16:10.8)*worldScale,pivot:center};}
  function enterRegion(i){if(i<0||i>=regions.length)return;if(activeRegion<0)beforeRegion=clone(heartOpen&&beforeHeart?beforeHeart:view);if(selected>=0)leaveStar(false);
    if(heartOpen)closeHeart(false);
    activeRegion=i;showHover(-1);fly(regionView(i),1800);window.dispatchEvent(new CustomEvent('universe:region',{detail:{index:i}}));
  }
  function exitRegion(){const old=activeRegion;if(heartOpen)closeHeart(false);if(selected>=0)leaveStar(false);activeRegion=-1;showHover(-1);fly(beforeRegion||home(),1800);beforeRegion=null;zoomOrigin=null;
    window.dispatchEvent(new CustomEvent('universe:region',{detail:{index:-1}}));if(old>=0)requestAnimationFrame(()=>regions[old].button.focus({preventScroll:true}));}
  window.addEventListener('universe:enter',e=>enterRegion(e.detail.index));
  window.addEventListener('universe:exit',exitRegion);
  window.addEventListener('universe:recenter',()=>{if(activeRegion>=0)fly(regionView(activeRegion));});
  function openHeart(){if(heartOpen)return;if(selected>=0)leaveStar();beforeHeart=clone(view);heartOpen=true;showHover(-1);$('#settings').hidden=true;$('#about-universe').hidden=false;document.body.classList.add('reading-intro');
    const center=galaxy.localToWorld(heartPosition.clone());if(innerWidth>=650)center.x+=1.5;fly({yaw:0,pitch:.58,distance:innerWidth<650?16:13,pivot:center},1500);$('#close-about').focus({preventScroll:true});window.dispatchEvent(new Event('universe:heart-open'));}
  function closeHeart(restore=true){if(!heartOpen)return;heartOpen=false;$('#about-universe').hidden=true;document.body.classList.remove('reading-intro');if(restore&&beforeHeart){fly(beforeHeart);$('#universe-heart').focus({preventScroll:true});}beforeHeart=null;window.dispatchEvent(new CustomEvent('universe:heart-close',{detail:{restore}}));}
  $('#universe-heart').onclick=openHeart;$('#universe-heart').addEventListener('wheel',onWheel,{passive:false});$('#close-about').onclick=()=>closeHeart();$('#about-explore').onclick=()=>enterRegion(0);window.addEventListener('universe:heart',openHeart);
  function setJourney(name){document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===name);b.setAttribute('aria-pressed',String(b.dataset.view===name));});}
  function fly(to,duration=1700){velocity.x=velocity.y=0;target=clone(to);document.body.classList.toggle('travelling',!reduced);if(reduced){view=clone(to);flight=null;}else flight={from:clone(view),to:clone(to),started:performance.now(),duration};}
  function cancelFlight(){if(flight){target=clone(view);flight=null;}document.body.classList.remove('travelling');velocity.x=velocity.y=0;}
  function focusStar(i){
    if(!stars[i])return;
    const region=stars[i].region??0;
    if(activeRegion!==region){if(activeRegion<0)beforeRegion=zoomOrigin||clone(view);activeRegion=region;window.dispatchEvent(new CustomEvent('universe:region',{detail:{index:region,passive:true}}));}
    if(selected<0)beforeFocus=clone(view);selected=i;showHover(-1);document.body.classList.add('focused');$('#settings').hidden=true;$('#appearance').setAttribute('aria-expanded','false');
    galaxy.updateMatrixWorld(true);const center=galaxy.localToWorld(stars[i].position.clone());
    $('#card-title').textContent=stars[i].name;$('#star-card').hidden=false;
    window.dispatchEvent(new CustomEvent('galaxy:focus',{detail:{index:i}}));
    // Keep the selected point on the uncovered half of the desktop scene.
    if(innerWidth>=650)center.x+=1.3;
    fly({yaw:0,pitch:.58,distance:innerWidth<650?9:7.8,pivot:center},1400);setJourney('');
    $('#leave-star').focus({preventScroll:true});
  }
  function leaveStar(restore=true){const old=selected;selected=-1;document.body.classList.remove('focused');$('#star-card').hidden=true;showHover(-1);if(restore&&beforeFocus){fly(beforeFocus);if(old>=0)$('#project-list-toggle').focus({preventScroll:true});}beforeFocus=null;window.dispatchEvent(new CustomEvent('galaxy:leave',{detail:{restoring:restore}}));}
  window.addEventListener('galaxy:select',e=>{const i=e.detail?.index;if(Number.isInteger(i)&&i>=0&&i<stars.length)focusStar(i);});
  window.addEventListener('galaxy:return',()=>leaveStar());
  $('#leave-star').onclick=()=>leaveStar();
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{
    leaveStar(false);const mode=b.dataset.view,to=home();if(mode==='wander'){to.yaw=-.23;to.pitch=.27;to.distance=mobile?17:12.2;to.pivot.set(1.6,.1,1.4);}if(mode==='core'){to.yaw=.12;to.pitch=.45;to.distance=mobile?13:7.8;}
    fly(to,2200);setJourney(mode);
  });
  $('#reset').textContent='星云总览';$('#reset').onclick=()=>{exitRegion();fly(overview());};
  const pause=$('#pause');function updatePause(){pause.textContent=paused?'继续流动':'暂停流动';pause.setAttribute('aria-pressed',String(paused));}
  pause.onclick=()=>{paused=!paused;updatePause();};updatePause();
  const immersive=$('#immersive');immersive.onclick=()=>{const on=document.body.classList.toggle('immersive');immersive.innerHTML=on?'显示文字 <kbd>H</kbd>':'只看星河 <kbd>H</kbd>';immersive.setAttribute('aria-pressed',String(on));$('#settings').hidden=true;$('#appearance').setAttribute('aria-expanded','false');showHover(-1);};
  const appearance=$('#appearance'),settings=$('#settings');appearance.onclick=()=>{settings.hidden=!settings.hidden;appearance.setAttribute('aria-expanded',String(!settings.hidden));};
  $('#close-settings').onclick=()=>{settings.hidden=true;appearance.setAttribute('aria-expanded','false');appearance.focus();};
  for(const[id,key]of[['mist','uMist'],['brightness','uBrightness'],['warmth','uWarmth']])$('#'+id).oninput=e=>U[key].value=Number(e.target.value)/100;
  addEventListener('keydown',e=>{
    if(e.key==='Escape'){if(!settings.hidden){settings.hidden=true;appearance.setAttribute('aria-expanded','false');appearance.focus();}else if(heartOpen)closeHeart();else if(selected>=0)leaveStar();else if(document.body.classList.contains('immersive'))immersive.click();else if(activeRegion>=0)exitRegion();return;}
    if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
    if(e.key.toLowerCase()==='h')immersive.click();
    if(e.code==='Space'&&e.target.tagName!=='BUTTON'){e.preventDefault();pause.click();}
  });
  function zoomAnchor(x,y){
    galaxy.updateMatrixWorld(true);raycaster.setFromCamera(new T.Vector2(x/innerWidth*2-1,1-y/innerHeight*2),camera);
    // A project may sit above the old disc. Aim at its actual 3D depth when nearby.
    let closest=null,best=50;for(const star of stars){if(!star.screen)continue;const d=Math.hypot(star.screen.x-x,star.screen.y-y);if(d<best){closest=star;best=d;}}
    if(closest){const anchor=galaxy.localToWorld(closest.position.clone());const normal=camera.getWorldDirection(new T.Vector3()),plane=new T.Plane().setFromNormalAndCoplanarPoint(normal,anchor),hit=new T.Vector3();if(raycaster.ray.intersectPlane(plane,hit))return hit;}
    // Use the tilted star plane, not an unrelated horizontal world plane.
    const plane=new T.Plane(new T.Vector3(0,1,0),-.2).applyMatrix4(galaxy.matrixWorld),hit=new T.Vector3();
    if(raycaster.ray.intersectPlane(plane,hit)&&hit.length()<30)return hit;
    return view.pivot.clone();
  }
  function discoverRegion(anchor,inward){
    if(selected>=0)return;
    if(!inward&&target.distance>=home().distance*.93){
      if(activeRegion>=0){activeRegion=-1;beforeRegion=null;showHover(-1);window.dispatchEvent(new CustomEvent('universe:region',{detail:{index:-1,passive:true}}));}
      zoomOrigin=null;return;
    }
    if(!inward||target.distance>home().distance*.82)return;
    const local=galaxy.worldToLocal(anchor.clone());let nearest=-1,best=.93;
    regions.forEach((r,i)=>{const d=r.position.distanceTo(local)/r.radius;if(d<best){best=d;nearest=i;}});
    if(nearest>=0&&nearest!==activeRegion){if(activeRegion<0)beforeRegion=zoomOrigin||clone(view);activeRegion=nearest;showHover(-1);
      window.dispatchEvent(new CustomEvent('universe:region',{detail:{index:nearest,passive:true}}));}
  }
  function zoomAt(x,y,factor){
    if(heartOpen)return;
    cancelFlight();setJourney('');if(activeRegion<0&&factor<1&&!zoomOrigin)zoomOrigin=clone(view);
    const anchor=zoomAnchor(x,y),previous=target.distance,next=clamp(previous*factor,3.6,overview().distance*1.15);
    // Exact dolly ratio keeps the world point beneath the cursor in the same screen location.
    if(selected<0)target.pivot.lerp(anchor,1-next/previous);
    target.distance=next;discoverRegion(anchor,next<previous);
  }
  function onWheel(e){e.preventDefault();const delta=clamp(e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?innerHeight:1),-160,160);zoomAt(e.clientX,e.clientY,Math.exp(delta*.0014));}
  host.addEventListener('wheel',onWheel,{passive:false});
  let gestureStart=null,gestureMoved=false,suppressClickUntil=0;
  const isScene=e=>e.target instanceof Element&&e.target.closest('#universe,#star-targets,#region-targets');
  document.addEventListener('pointerdown',e=>{
    if(!isScene(e)||heartOpen)return;
    cancelFlight();showHover(-1);e.target.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===1){gestureStart={x:e.clientX,y:e.clientY};gestureMoved=false;suppressClickUntil=0;}
    drag={x:e.clientX,y:e.clientY,t:performance.now()};setJourney('');
    if(pointers.size===2){gestureMoved=true;const p=[...pointers.values()];pinch=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);}
  },true);
  document.addEventListener('pointermove',e=>{
    if(!isScene(e)&&!pointers.has(e.pointerId))return;
    cursor.x=e.clientX/innerWidth*2-1;cursor.y=e.clientY/innerHeight*2-1;
    if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const now=performance.now();if(gestureStart&&Math.hypot(e.clientX-gestureStart.x,e.clientY-gestureStart.y)>6)gestureMoved=true;
    if(pointers.size===2){const p=[...pointers.values()],d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(d>0&&pinch>0)zoomAt((p[0].x+p[1].x)/2,(p[0].y+p[1].y)/2,pinch/d);pinch=d;velocity.x=velocity.y=0;}
    else if(drag&&gestureMoved){
      if(e.shiftKey){const dx=(e.clientX-drag.x)*.0032,dy=(e.clientY-drag.y)*.0024;target.yaw-=dx;target.pitch=clamp(target.pitch+dy,.15,1.35);}
      else{const previous=zoomAnchor(drag.x,drag.y),current=zoomAnchor(e.clientX,e.clientY);target.pivot.add(previous.sub(current));target.pivot.clampLength(0,25);}
      velocity.x=velocity.y=0;
    }
    drag={x:e.clientX,y:e.clientY,t:now};
  },true);
  function release(e){if(!pointers.has(e.pointerId))return;if(gestureMoved)suppressClickUntil=performance.now()+350;pointers.delete(e.pointerId);velocity.x=velocity.y=0;drag=pointers.size?{...[...pointers.values()][0],t:performance.now()}:null;if(!pointers.size)gestureStart=null;}
  document.addEventListener('pointerup',release,true);document.addEventListener('pointercancel',release,true);
  document.addEventListener('click',e=>{if(isScene(e)&&performance.now()<suppressClickUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
  host.onpointerleave=()=>{cursor.x=cursor.y=0;};
  host.ondblclick=e=>{zoomAt(e.clientX,e.clientY,.66);};
  function resize(){const budget=innerWidth<650?2200000:4200000,ratio=Math.min(devicePixelRatio,2,Math.sqrt(budget/(innerWidth*innerHeight)));renderer.setPixelRatio(ratio);renderer.setSize(innerWidth,innerHeight);U.uPixel.value=ratio;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();light.setSize(Math.round(innerWidth*ratio),Math.round(innerHeight*ratio));}
  addEventListener('resize',resize);resize();
  function render(){renderer.setRenderTarget(light);renderer.render(scene,camera);renderer.setRenderTarget(null);renderer.render(postScene,postCamera);}
  function updateMarkers(){
    galaxy.updateMatrixWorld(true);camera.updateMatrixWorld(true);
    world.copy(heartPosition);galaxy.localToWorld(world);projected.copy(world).project(camera);const hx=(projected.x*.5+.5)*innerWidth,hy=(-projected.y*.5+.5)*innerHeight;const heart=$('#universe-heart');heart.hidden=heartOpen||activeRegion>=0||selected>=0||projected.z>1||hx<40||hx>innerWidth-40||hy<100||hy>innerHeight-150;heart.style.left=hx+'px';heart.style.top=(hy+24)+'px';
    stars.forEach((star,i)=>{world.copy(star.position);galaxy.localToWorld(world);projected.copy(world).project(camera);const x=(projected.x*.5+.5)*innerWidth,y=(-projected.y*.5+.5)*innerHeight;
      const closeEnough=activeRegion===(star.region??0)||(activeRegion<0&&view.distance<home().distance*.82);
      star.screen={x,y};const visible=closeEnough&&selected<0&&projected.z<1&&projected.z>-1&&x>24&&x<innerWidth-24&&y>90&&y<innerHeight-100;
      star.button.hidden=!visible;star.button.style.transform=`translate(${x-22}px,${y-22}px)`;star.button.classList.toggle('label-left',x>innerWidth-230);
      if(hovered===i&&visible){tooltip.style.left=clamp(x+25,8,innerWidth-120)+'px';tooltip.style.top=clamp(y-16,8,innerHeight-80)+'px';}
    });
    regions.forEach(r=>{world.copy(r.position);world.z-=r.radius*.25;world.y+=.5;galaxy.localToWorld(world);projected.copy(world).project(camera);const x=(projected.x*.5+.5)*innerWidth,y=(-projected.y*.5+.5)*innerHeight;
      r.screen={x,y};r.button.hidden=activeRegion>=0||projected.z>1||projected.z< -1||y<170||y>innerHeight-170;
      r.button.style.left=clamp(x,innerWidth<650?85:120,innerWidth-(innerWidth<650?85:120))+'px';r.button.style.top=y+'px';});
  }
  document.addEventListener('visibilitychange',()=>{visible=!document.hidden;last=performance.now();});
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();visible=false;$('#error').hidden=false;});
  let fpsFrames=0,fpsStart=performance.now(),fps=0;
  function frame(now){requestAnimationFrame(frame);const dt=clamp((now-last)/1000,0,.05);last=now;if(!visible)return;
    const aiming=document.querySelector('.star-target:hover,.region-target:hover,#universe-heart:hover,.star-target:focus-visible,.region-target:focus-visible,#universe-heart:focus-visible');
    rotationMoving=sceneSettings.autoRotate&&!paused&&!reduced&&!flight&&!drag&&!heartOpen&&selected<0&&activeRegion<0&&view.distance>=home().distance*.93&&now>motionHoldUntil&&!aiming&&!document.hidden;
    if(rotationMoving)spin=(spin+dt*rotationSpeed)%(Math.PI*2);
    if(!paused&&!reduced)elapsed+=dt;U.uTime.value=elapsed;galaxy.rotation.y=spin;
    const flowing=sceneSettings.autoRotate&&!paused&&!reduced&&!flight&&!drag&&!heartOpen&&selected<0&&now>motionHoldUntil&&!aiming;
    if(flowing)U.uOrbit.value+=dt;
    // Ambient cloud flow continues inside a category; project stars remain anchored.
    atmosphere.rotation.y=U.uOrbit.value*.0012;atmosphere.rotation.x=Math.sin(U.uOrbit.value*.025)*.012;
    if(flight){let t=clamp((now-flight.started)/flight.duration,0,1);const e=t*t*t*(t*(t*6-15)+10);for(const k of ['yaw','pitch','distance'])view[k]=mix(flight.from[k],flight.to[k],e);view.pivot.lerpVectors(flight.from.pivot,flight.to.pivot,e);if(t===1){flight=null;document.body.classList.remove('travelling');}}
    else{if(!drag&&!reduced){target.yaw+=velocity.x*dt;target.pitch=clamp(target.pitch+velocity.y*dt,-.05,1.45);velocity.x*=Math.exp(-dt*4.5);velocity.y*=Math.exp(-dt*4.5);}const ease=reduced?1:1-Math.exp(-dt*9);for(const k of ['yaw','pitch','distance'])view[k]=mix(view[k],target[k],ease);view.pivot.lerp(target.pivot,ease);}
    parallax.x=mix(parallax.x,reduced||drag||selected>=0?0:cursor.x*.008,1-Math.exp(-dt*3));parallax.y=mix(parallax.y,reduced||drag||selected>=0?0:cursor.y*.005,1-Math.exp(-dt*3));
    const yaw=view.yaw+parallax.x,pitch=view.pitch+parallax.y;
    U.uViewDistance.value=view.distance;
    camera.position.set(Math.sin(yaw)*Math.cos(pitch)*view.distance,Math.sin(pitch)*view.distance,Math.cos(yaw)*Math.cos(pitch)*view.distance).add(view.pivot);camera.lookAt(view.pivot);
    render();updateMarkers();if(++frames===2)$('#loading').hidden=true;
    fpsFrames++;if(now-fpsStart>1500){fps=fpsFrames*1000/(now-fpsStart);fpsStart=now;fpsFrames=0;}
  }
  requestAnimationFrame(frame);
  const particleCount=(()=>{let n=0;scene.traverse(o=>{if(o.isPoints)n+=o.geometry.attributes.position.count;});return n;})();
  window.galaxySample={renderer,scene,camera,uniforms:U,getState:()=>({version:11,hdr,particleCount,orbitTime:U.uOrbit.value,paused,elapsed,selected,activeRegion,heartOpen,depth:thickness,ambientAngle:atmosphere.rotation.y,renderPasses:2,rotation:{angle:spin,moving:rotationMoving,periodSeconds:sceneSettings.rotationMinutes*60},flight:!!flight,view:{...view,pivot:view.pivot.toArray()},velocity:{...velocity},regions:regions.map(r=>({name:r.name,...r.screen,visible:!r.button.hidden})),stars:stars.map(s=>({id:s.id,name:s.name,region:s.region,...s.screen,visible:!s.button.hidden})),frames,fps})};
  window.dispatchEvent(new Event('universe:ready'));
})();




