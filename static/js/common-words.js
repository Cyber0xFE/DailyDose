/**
 * 最常见英文单词集合 — 用于过滤不需要预加载的简单词。
 * 包含：冠词、代词、介词、连词、助动词、最常用实词，约 900 个。
 */
const COMMON_WORDS = new Set([
  // 冠词 / 限定词
  "the","a","an","this","that","these","those","some","any","no","every","each","all","both",
  "few","many","much","more","most","several","such","own","other","another","same",
  // 代词
  "i","you","he","she","it","we","they","me","him","her","us","them","my","your","his",
  "its","our","their","mine","yours","hers","ours","theirs","myself","yourself","himself",
  "herself","itself","ourselves","themselves","who","whom","whose","which","what","one","ones",
  // 介词
  "in","on","at","to","for","with","from","by","of","about","into","through","during","before",
  "after","above","below","between","under","over","up","down","out","off","near","without",
  "within","along","among","behind","beside","beyond","inside","outside","upon","toward","towards",
  "across","against","around","past","since","until","till","onto","throughout",
  // 连词
  "and","but","or","so","if","when","while","because","as","than","though","although","yet",
  "nor","whether","once","unless","whereas","even",
  // 助动词 / 情态动词
  "is","are","was","were","be","been","being","have","has","had","having","do","does","did",
  "doing","will","would","shall","should","can","could","may","might","must","need","dare",
  "ought","used",
  // 副词（高频）
  "not","here","there","then","now","just","also","too","very","only","still","already",
  "always","never","sometimes","often","usually","ever","yet","again","quite","rather",
  "almost","enough","perhaps","maybe","really","always","even","else","especially","exactly",
  "certainly","obviously","probably","possibly","actually","suddenly","quickly","simply",
  "nearly","fully","hardly","scarcely","soon","later","ago","once","twice",
  // 最常见动词
  "say","get","make","go","know","take","see","come","think","look","want","give","use",
  "find","tell","ask","work","seem","feel","try","leave","call","put","mean","keep","let",
  "begin","start","show","hear","play","run","move","live","believe","hold","bring","happen",
  "write","provide","sit","pay","meet","include","continue","set","learn","change","lead",
  "understand","watch","follow","help","stop","create","speak","read","allow","add","spend",
  "grow","open","walk","win","offer","remember","love","consider","appear","buy","wait",
  "serve","die","send","expect","build","stay","fall","cut","reach","kill","raise","remain",
  "suggest","develop","require","turn","produce","carry","pass","receive","agree","support",
  "pick","eat","draw","describe","cover","report","decide","thank","check","fill","wish",
  "wonder","notice","like","worry","drive","fight","smile","sing","sleep","ride","drink",
  "cook","teach","smile","afford","answer","apply","arrive","attack","avoid","beat","become",
  "break","burn","catch","choose","clean","climb","close","collect","compare","complain",
  "complete","connect","contain","control","cook","copy","correct","cost","count","cross",
  "cry","damage","dance","deal","deliver","demand","design","destroy","discover","discuss",
  "divide","doubt","dream","dress","earn","encourage","enjoy","enter","escape","examine",
  "excuse","exercise","exist","expect","explain","express","fail","fasten","feed","fetch",
  "finish","fix","fly","focus","follow","force","forget","forgive","freeze","gather",
  "guess","handle","hang","hate","hide","hit","hope","hunt","hurry","hurt","ignore",
  "imagine","improve","increase","inform","intend","interest","interrupt","introduce",
  "invite","join","jump","kick","kiss","knock","land","last","laugh","lay","lend","lie",
  "lift","limit","link","listen","lock","manage","mark","match","matter","mention",
  "miss","mix","notice","obtain","occur","operate","order","organize","owe","own","pack",
  "paint","perform","persuade","place","plan","plant","please","point","prefer","prepare",
  "press","pretend","prevent","promise","protect","prove","pull","punish","push","realize",
  "recommend","record","reduce","refer","reflect","refuse","regret","relate","release",
  "rely","remove","repair","repeat","replace","reply","require","rest","result","return",
  "ring","risk","roll","rub","rule","rush","save","search","sell","separate","settle",
  "shake","share","shoot","shout","shut","sign","spread","stand","steal","stick","stir",
  "store","stretch","strike","struggle","succeed","suffer","supply","suppose","surround",
  "survive","suspect","swim","switch","taste","tear","test","throw","touch","trade",
  "train","travel","treat","trust","visit","vote","wake","warn","wash","waste","watch",
  "wear","win","wonder","worry","wrap",
  // 最常见形容词
  "good","new","first","last","long","great","little","own","other","old","right","big",
  "high","different","small","large","next","early","young","important","few","public",
  "bad","same","able","possible","likely","sure","real","clear","strong","true","simple",
  "certain","full","free","hard","ready","whole","black","white","red","blue","green",
  "dark","light","nice","happy","sad","angry","afraid","sorry","fine","best","better",
  "short","tall","low","wide","close","open","dead","alive","sweet","hot","cold","warm",
  "cool","fresh","clean","dirty","dry","wet","fast","slow","far","near","cheap","expensive",
  "easy","difficult","hard","soft","rich","poor","lucky","safe","dangerous","beautiful",
  "ugly","pretty","handsome","sick","ill","healthy","busy","free","busy","lazy","brave",
  "calm","nervous","proud","ashamed","glad","lovely","terrible","awful","wonderful",
  "excellent","perfect","serious","funny","strange","odd","normal","common","rare","special",
  "general","particular","specific","similar","popular","famous","natural","traditional",
  "modern","ancient","foreign","local","national","international","personal","private",
  "public","social","political","economic","cultural","religious","scientific","technical",
  "physical","mental","emotional","basic","main","major","minor","total","final","original",
  "official","formal","informal","regular","positive","negative","active","passive","direct",
  "indirect","separate","single","double","triple","average","extra","further","additional",
  "previous","following","standard","professional","responsible","successful","comfortable",
  "interested","interesting","exciting","exciting","boring","tired","surprised","surprising",
  "worried","worrying","annoyed","annoying","confused","confusing","pleased","pleasant",
  // 最常见名词
  "time","person","year","way","day","thing","man","world","life","hand","part","child",
  "eye","woman","place","work","week","case","point","government","company","number","group",
  "problem","fact","home","water","room","mother","area","money","story","month","right",
  "study","book","night","job","word","business","issue","side","kind","head","house",
  "service","friend","father","power","hour","game","line","end","member","law","car",
  "city","community","name","president","team","minute","idea","body","information","parent",
  "face","level","office","door","health","art","war","history","party","result","morning",
  "reason","research","girl","guy","moment","air","teacher","force","education","food",
  "boy","age","death","experience","rate","note","plan","class","school","top","amount",
  "family","student","state","people","question","project","center","market","series",
  "baby","street","letter","language","society","paper","church","lot","land","mile",
  "nature","science","table","figure","bed","step","ground","shoes","hope",
]);

/**
 * 判断单词是否需要预加载（不在常见词列表中的词视为"生词"）。
 */
function isDifficultWord(word) {
  const clean = word.toLowerCase().replace(/[^a-z']/g, '');
  if (clean.length <= 2) return false;  // 过短的不预加载
  if (clean.endsWith("'s") || clean.endsWith("'ll") || clean.endsWith("'re") ||
      clean.endsWith("'ve") || clean.endsWith("'d") || clean.endsWith("n't")) {
    return false;  // 缩写形式不预加载
  }
  return !COMMON_WORDS.has(clean);
}
