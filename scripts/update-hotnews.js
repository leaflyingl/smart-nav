// scripts/update-hotnews.js
const fs = require("fs");

async function fetchWithUA(url, customHeaders = {}, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
          "Accept": "application/json, text/plain, */*",
          "Referer": new URL(url).origin + "/",
          ...customHeaders
        }
      });
      clearTimeout(id);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    } catch (e) {
      clearTimeout(id);
      if (attempt === retries) return null;
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  return null;
}

// ==================== 所有数据源函数 ====================

async function getBaidu() {
  const json = await fetchWithUA("https://top.baidu.com/api/board?tab=realtime");
  const list = json?.data?.cards?.[0]?.content || [];
  return list.slice(0, 5).map(i => ({ title: i.word, url: i.url || `https://www.baidu.com/s?wd=${encodeURIComponent(i.word)}` }));
}

async function getBilibili() {
  const json = await fetchWithUA("https://api.bilibili.com/x/web-interface/popular?ps=10&pn=1", {
    "Referer": "https://www.bilibili.com/"
  });
  const list = json?.data?.list || [];
  return list.slice(0, 5).map(i => ({ 
    title: i.title, 
    url: i.short_link_v2 || i.arcurl || `https://www.bilibili.com/video/${i.bvid}` 
  }));
}

async function getToutiao() {
  const json = await fetchWithUA("https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc");
  const list = json?.data || [];
  return list.slice(0, 5).map(i => ({ title: i.Title, url: `https://www.toutiao.com/trending/${i.ClusterIdStr}/` }));
}

async function getIThome() {
  const json = await fetchWithUA("https://api.ithome.com/json/newslist/news", { "Referer": "https://www.ithome.com/" });
  let list = json || [];
  if (!Array.isArray(list)) list = json?.newslist || [];
  return list.slice(0, 5).map(i => ({
    title: i.title,
    url: i.url || `https://www.ithome.com/0/${Math.floor(i.newsid/1000)}/${i.newsid}.htm`
  }));
}

async function getNetease() {
  const json = await fetchWithUA("https://c.m.163.com/nc/article/headline/T1348647853363/0-40.html");
  const rawList = json?.T1348647853363 || [];
  const items = [];
  for (const item of rawList) {
    if (item?.title && items.length < 5) {
      const targetUrl = item.url || (item.docid ? `https://3g.163.com/touch/article/${item.docid}.html` : "https://news.163.com");
      items.push({ title: item.title, url: targetUrl });
    }
  }
  return items;
}

async function getWallstreet() {
  const json = await fetchWithUA("https://api-one-wscn.wallstreetcn.com/apiv1/content/lives?channel=global-channel&limit=10", {
    "Origin": "https://wallstreetcn.com",
    "Referer": "https://wallstreetcn.com/"
  });
  const list = json?.data?.items || [];
  return list.slice(0,5).map(i => {
    const text = (i.title || i.content_text || "").replace(/<[^>]+>/g, "").trim();
    return { title: text.slice(0, 55) + "...", url: i.uri || "https://wallstreetcn.com/live/global" };
  }).filter(i => i.title.length > 15);
}

async function getJiemian() {
  const json = await fetchWithUA("https://www.jiemian.com/api/v1/news/getNewsListByChannel.json?channel_id=1&page=1", {
    "Referer": "https://www.jiemian.com/"
  });
  let list = json?.data?.list || [];
  return list.slice(0,5).map(i => ({
    title: i.title,
    url: i.ar_url || i.url || `https://www.jiemian.com/article/${i.id}.html`
  }));
}

async function getEastmoney() {
  const json = await fetchWithUA("https://np-listapi.eastmoney.com/comm/web/getFastNewsList?client=web&biz=web_news&pageIndex=1&pageSize=10", {
    "Referer": "https://kuaixun.eastmoney.com/",
    "Origin": "https://eastmoney.com"
  });
  const list = json?.data?.fastNewsList || json?.Data || [];
  return list.slice(0,5).map(i => ({
    title: i.title || i.Title,
    url: i.url || `https://kuaixun.eastmoney.com/`
  }));
}

async function getGithub() {
  const json = await fetchWithUA("https://api.github.com/search/repositories?q=created:>2025-01-01&sort=stars&order=desc&per_page=5");
  const list = json?.items || [];
  return list.slice(0, 5).map(i => ({ title: `${i.full_name}: ${i.description || "无描述"}`, url: i.html_url }));
}

async function getHuggingFace() {
  const json = await fetchWithUA("https://huggingface.co/api/models?sort=downloads&direction=-1&limit=5");
  const list = Array.isArray(json) ? json : [];
  return list.map(i => ({ title: `Model: ${i.id}`, url: `https://huggingface.co/${i.id}` }));
}

async function getTonghuashun() {
  return [{ title: "同花顺 7x24 实时快讯", url: "https://news.10jqka.com.cn/realtimenews.html" }];
}

async function main() {
  console.log("开始并行抓取所有数据源...");

  const results = await Promise.all([
    getBaidu(), getBilibili(), getToutiao(), getIThome(),
    getNetease(), getWallstreet(), getJiemian(), getEastmoney(),
    getGithub(), getHuggingFace(), getTonghuashun()
  ]);

  const keys = [
    "baidu", "bilibili", "toutiao", "ithome",
    "netease", "wallstreet", "jiemian", "eastmoney",
    "github", "huggingface", "tonghuashun"
  ];

  const finalData = { updatedAt: new Date().toISOString() };

  keys.forEach((key, index) => {
    if (Array.isArray(results[index]) && results[index].length > 0) {
      finalData[key] = results[index];
    }
  });

  fs.writeFileSync("./hotnews.json", JSON.stringify(finalData, null, 2));
  console.log("hotnews.json 更新完成！包含源:", Object.keys(finalData).filter(k => k !== "updatedAt"));
}

main().catch(err => {
  console.error("执行出错:", err);
  process.exit(1);
});
