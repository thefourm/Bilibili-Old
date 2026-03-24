import { DanmakuCmd, DanmakuElem } from "../io/grpc/api-dm-web";

export class DanmakuBase {
    /** 从小到大排序弹幕 */
    static sortDmById(dms: DanmakuElem[]) {
        dms.sort((a, b) => this.bigInt(a.idStr, b.idStr) ? 1 : -1);
    }
    /** 比较两个弹幕ID先后 */
    static bigInt(num1: string, num2: string) {
        String(num1).replace(/\d+/, d => num1 = d.replace(/^0+/, ""));
        String(num2).replace(/\d+/, d => num2 = d.replace(/^0+/, ""));
        // 数位不同，前者大为真，否则为假
        if (num1.length > num2.length) return true;
        else if (num1.length < num2.length) return false;
        else {
            // 数位相同，逐位比较
            for (let i = 0; i < num1.length; i++) {
                // 任意一位前者大为真
                if (num1[i] > num2[i]) return true;
                // 任意一位前者小为假
                if (num1[i] < num2[i]) return false;
                // 仅当位相等时继续比较下一位
            }
            // 包括相等情况返回假
            return false;
        }
    }
    /**
     * 重构为旧版弹幕类型
     *
     * 转换前（`DanmakuElem`，新版 protobuf 格式）：
     * ```json
     * {
     *   "id": 123456,
     *   "progress": 3000,
     *   "mode": 1,
     *   "fontsize": 25,
     *   "color": 16777215,
     *   "midHash": "a1b2c3d4",
     *   "content": "弹幕内容",
     *   "ctime": 1609459200,
     *   "weight": 10,
     *   "action": "",
     *   "pool": 0,
     *   "idStr": "123456"
     * }
     * ```
     *
     * 转换后（`DanmakuCmd`，旧版 XML 属性格式）：
     * ```json
     * {
     *   "class": 0,
     *   "pool": 0,
     *   "color": 16777215,
     *   "date": 1609459200,
     *   "dmid": "123456",
     *   "mode": 1,
     *   "size": 25,
     *   "stime": 3,
     *   "text": "弹幕内容",
     *   "uhash": "a1b2c3d4",
     *   "uid": "a1b2c3d4",
     *   "weight": 10
     * }
     * ```
     *
     * 主要字段映射：
     * - `progress`（毫秒）÷ 1000 → `stime`（秒）
     * - `fontsize` → `size`
     * - `ctime` → `date`
     * - `idStr` → `dmid`
     * - `midHash` → `uhash` / `uid`
     * - `pool` → `class` / `pool`
     * - `content` → `text`（非代码/BAS弹幕时规范化换行符）
     * - `action`（含 `picture:` 前缀时）→ `html`（`<img>` 标签）
     */
    static parseCmd(dms: DanmakuElem[]) {
        return dms.map(d => {
            const dm: DanmakuCmd = {
                class: d.pool || 0,
                color: d.color || 0,
                date: d.ctime || 0,
                dmid: d.idStr || '',
                mode: +d.mode || 1,
                pool: d.pool || 0,
                size: d.fontsize || 25,
                stime: d.progress / 1000 || 0,
                text: (d.content && d.mode != 8 && d.mode != 9) ? d.content.replace(/(\/n|\\n|\n|\r\n)/g, '\n') : d.content,
                uhash: d.midHash || '',
                uid: d.midHash || '',
                weight: d.weight,
                attr: d.attr,
            };
            d.action?.startsWith("picture:") && (dm.html = `<img src="${d.action.replace('picture:', '//')}" style="width:auto;height:28.13px;">`);
            return dm;
        })
    }
    /**
     * 解析解码 XML 弹幕
     *
     * 转换前（B 站旧版 XML 弹幕格式，`<d>` 元素的 `p` 属性为逗号分隔的 8 个字段）：
     * ```xml
     * <?xml version="1.0" encoding="UTF-8"?>
     * <i>
     *   <chatserver>chat.api.bilibili.com</chatserver>
     *   <chatid>12345</chatid>
     *   ...
     *   <d p="3.000,1,25,16777215,1609459200,0,a1b2c3d4,123456">弹幕内容</d>
     * </i>
     * ```
     * `p` 属性各字段含义（索引 0~7）：
     * - [0] stime（秒，浮点）
     * - [1] mode（弹幕类型）
     * - [2] fontsize（字号）
     * - [3] color（颜色，十进制整数）
     * - [4] ctime（发送时间戳）
     * - [5] pool（弹幕池）
     * - [6] midHash（用户 MD5 哈希）
     * - [7] id（弹幕 ID）
     *
     * 转换后（`DanmakuElem`，新版 protobuf 对应的 JS 对象格式）：
     * ```json
     * {
     *   "pool": 0,
     *   "color": 16777215,
     *   "ctime": 1609459200,
     *   "id": 123456,
     *   "idStr": "123456",
     *   "mode": 1,
     *   "fontsize": 25,
     *   "progress": 3000,
     *   "content": "弹幕内容",
     *   "midHash": "a1b2c3d4"
     * }
     * ```
     */
    static decodeXml(xml: string | Document) {
        if (typeof xml === 'string') {
            // B站输出的xml可能包含不标准的字符,会引起浏览器自动解析失败
            // remove-invalid-xml-characters.js
            // @link https://gist.github.com/john-doherty/b9195065884cdbfd2017a4756e6409cc
            // @license MIT
            // @see https://en.wikipedia.org/wiki/Valid_characters_in_XML
            xml = xml.replace(/((?:[\0-\x08\x0B\f\x0E-\x1F\uFFFD\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]))/g, '');
            xml = new DOMParser().parseFromString(xml, 'application/xml');
        }
        const items = xml.querySelectorAll('d');
        const dms: DanmakuElem[] = [];
        items.forEach(d => {
            const json = d.getAttribute('p')!.split(',');
            const text = d.textContent || (<HTMLAnchorElement>d).text;
            if (text) {
                const dm: DanmakuElem = {
                    pool: Number(json[5]),
                    color: Number(json[3]),
                    ctime: Number(json[4]),
                    id: Number(json[7]),
                    idStr: String(json[7]),
                    mode: Number(json[1]),
                    fontsize: Number(json[2]),
                    progress: Number(json[0]) * 1000,
                    content: String(text),
                    midHash: json[6]
                }
                dms.push(dm);
            }
        });
        return dms;
    }
    /**
     * 编码 XML 弹幕
     *
     * 转换前（`DanmakuCmd[]`，旧版弹幕对象数组）：
     * ```json
     * [
     *   {
     *     "stime": 3,
     *     "mode": 1,
     *     "size": 25,
     *     "color": 16777215,
     *     "date": 1609459200,
     *     "class": 0,
     *     "uid": "a1b2c3d4",
     *     "dmid": "123456",
     *     "text": "弹幕内容"
     *   }
     * ]
     * ```
     *
     * 转换后（B 站旧版 XML 弹幕字符串，`<d>` 元素的 `p` 属性为逗号分隔字段）：
     * ```xml
     * <?xml version="1.0" encoding="UTF-8"?>
     * <i>
     *   <chatserver>chat.api.bilibili.com</chatserver>
     *   <chatid>12345</chatid>
     *   <mission>0</mission>
     *   <maxlimit>1</maxlimit>
     *   <state>0</state>
     *   <real_name>0</real_name>
     *   <source>k-v</source>
     *   <d p="3,1,25,16777215,1609459200,0,a1b2c3d4,123456">弹幕内容</d>
     * </i>
     * ```
     * `p` 属性格式：`${stime},${mode},${size},${color},${date},${class},${uid},${dmid}`  
     * 注意：非代码/BAS 弹幕（mode 非 8/9）的换行符会被替换为 `/n`；`<` 和 `&` 会被转义。
     * @param dms 弹幕对象数组
     * @param cid 视频分 P 的 cid
     */
    static encodeXml(dms: DanmakuCmd[], cid: number) {
        return dms.reduce((s, d) => {
            // 代码弹幕及BAS弹幕无须处理换行符
            const text = (d.mode === 8 || d.mode === 9) ? d.text : (d.text ?? '').replace(/(\n|\r\n)/g, "/n");
            s += `<d p="${d.stime},${d.mode},${d.size},${d.color},${d.date},${d.class},${d.uid},${d.dmid}">${text.replace(/[<&]/g, (a: string) => { return <string>{ '<': '&lt;', '&': '&amp;' }[a] })}</d>\n`;
            return s;
        }, `<?xml version="1.0" encoding="UTF-8"?><i><chatserver>chat.api.bilibili.com</chatserver><chatid>${cid}</chatid><mission>0</mission><maxlimit>${dms.length}</maxlimit><state>0</state><real_name>0</real_name><source>k-v</source>\n`) + '</i>';
    }
}