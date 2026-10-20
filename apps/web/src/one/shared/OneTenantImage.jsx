const idPattern=/^asset:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const types=new Set(["image/png","image/jpeg","image/webp","image/gif"]);
/** Never inject media URLs into the DOM without a validated source. */
export default function OneTenantImage({src,alt="",loadAsset, ...props}) {
  const [loaded,setLoaded]=React.useState("");
  React.useEffect(()=>{
    let active=true;
    setLoaded("");
    const match=typeof src==="string"?src.match(idPattern):null;
    if(!match || typeof loadAsset!=="function")return ()=>{active=false;};
    Promise.resolve(loadAsset(match[1])).then(asset=>{
      if(!active||!asset||!types.has(asset.contentType)
        ||typeof asset.contentBase64!=="string"
        ||asset.contentBase64.length>7100000
        ||!/^[A-Za-z0-9+/]+={0,2}$/.test(asset.contentBase64))return;
      setLoaded("data:"+asset.contentType+";base64,"+asset.contentBase64);
    }).catch(()=>{if(active)setLoaded("");});
    return ()=>{active=false;};
  },[src,loadAsset]);
  const external=typeof src==="string"&&/^https:\/\//i.test(src);
  const source=external?src:loaded;
  return source?<img {...props} src={source} alt={alt}/>:
    <span className="one-empty" role="status">Image unavailable</span>;
}
