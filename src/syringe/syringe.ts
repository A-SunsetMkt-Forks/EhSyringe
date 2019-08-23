import { uiData } from '../data/ui-data';
import { config } from '../tool/config-manage';
import { logger } from '../tool/log';
import { getTagData } from '../tool/tag-data';

import './syringe.less';

(window as any).tagClear = () => {
    window.localStorage.removeItem('tag-list');
    window.localStorage.removeItem('tag-replace-data');
    window.localStorage.removeItem('tag-update-time');
    window.localStorage.removeItem('tag-sha');
    chrome.storage.local.remove('tagList');
    chrome.storage.local.remove('tagReplaceData');
    chrome.storage.local.remove('updateTime');
    chrome.storage.local.remove('tagDB');
    chrome.storage.local.remove('sha');
};

class Syringe {
    readonly tagReplace = getTagData().tagReplace;
    documentEnd = false;
    readonly skipNode: Set<string> = new Set(['TITLE', 'LINK', 'META', 'HEAD', 'SCRIPT', 'BR', 'HR', 'STYLE', 'MARK']);
    readonly conf = config.syncGet();
    observer?: MutationObserver;

    constructor() {
        config.sync().catch(logger.error);
        if (this.conf.translateTag || this.conf.translateUI) {
            this.init();
        }
    }

    isNode<K extends keyof HTMLElementTagNameMap>(node: Node, nodeName: K): node is HTMLElementTagNameMap[K] {
        return node && node.nodeName === nodeName.toUpperCase();
    }

    private init(): void {
        window.document.addEventListener('DOMContentLoaded', (e) => {
            this.documentEnd = true;
        });
        this.observer = new MutationObserver(mutations => mutations.forEach(mutation =>
            mutation.addedNodes.forEach(node1 => {
                this.translateNode(node1);
                if (this.documentEnd && node1.childNodes) {
                    const nodeIterator = document.createNodeIterator(node1);
                    let node = nodeIterator.nextNode();
                    while (node) {
                        this.translateNode(node);
                        node = nodeIterator.nextNode();
                    }
                }
            })
        ));
        this.observer.observe(window.document, {
            attributes: true,
            childList: true,
            subtree: true
        });
    }

    translateNode(node: Node): void {
        if (
            (!node.nodeName) ||
            this.skipNode.has(node.nodeName) ||
            (node.parentNode && this.skipNode.has(node.parentNode.nodeName))
        ) { return; }

        if (this.isNode(node, 'body')) {
            node.classList.add(location.host.indexOf('exhentai') === -1 ? 'eh' : 'ex');
            if (!this.conf.showIcon) { node.classList.add('ehs-hide-icon'); }
            node.classList.add(`ehs-image-level-${this.conf.introduceImageLevel}`);
        }

        let handled = false;
        if (this.conf.translateTag) {
            handled = this.translateTag(node);
        }
        /* tag 处理过的ui不再处理*/
        if (this.conf.translateUI && !handled) {
            this.translateUi(node);
        }

    }

    private isTagContainer(node: Element): boolean {
        if (!node) { return false; }
        return node.classList.contains('gt') ||
            node.classList.contains('gtl') ||
            node.classList.contains('gtw');
    }

    translateTag(node: Node): boolean {
        if (node.nodeName !== '#text' || !node.parentElement) {
            return false;
        }
        const parentElement = node.parentElement;
        if (parentElement.nodeName === 'MARK' || parentElement.classList.contains('auto-complete-text')) {
            // 不翻译搜索提示的内容
            return true;
        }

        // 标签只翻译已知的位置
        if (!this.isTagContainer(parentElement) && !this.isTagContainer(parentElement.parentElement)) {
            return false;
        }

        let value = '';
        let aId = parentElement.id;
        let aTitle = parentElement.title;

        if ((!value) && aTitle) {
            if (aTitle[0] === ':') {
                aTitle = aTitle.slice(1);
            }
            if (this.tagReplace[aTitle]) {
                value = this.tagReplace[aTitle];
            }
        }

        if ((!value) && aId) {
            aId = aId.replace('ta_', '');
            aId = aId.replace(/_/ig, ' ');
            if (this.tagReplace[aId]) {
                value = this.tagReplace[aId];
            }
        }

        if (value) {
            if (node.textContent[1] === ':') {
                value = `${node.textContent[0]}:${value}`;
            }
            if (node.parentElement.hasAttribute('ehs-tag')) {
                return true;
            }
            node.parentElement.setAttribute('ehs-tag', node.textContent);
            if (value !== node.textContent) {
                node.parentElement.innerHTML = value;
            } else {
                logger.log('翻译内容相同', value);
            }
            return true;
        }

        return false;
    }

    translateUi(node: Node): void {
        if (node.nodeName === '#text') {
            if (uiData[node.textContent]) {
                node.textContent = uiData[node.textContent];
                return;
            }
            let text = node.textContent;
            text = text.replace(/(\d+) pages?/, '$1 页');
            text = text.replace(/Torrent Download \( (\d+) \)/, '种子下载（$1）');
            text = text.replace(/Average: ([\d\.]+)/, '平均值：$1');
            text = text.replace(/Posted on (.*?) by:\s*/, (_, t) => `评论时间：${new Date(t).toLocaleString()} \xA0作者：`);
            text = text.replace(/Showing ([\d,]+) results?\. Your filters excluded ([\d,]+) galler(ies|y) from this page/, '共 $1 个结果，你的过滤器已从此页面移除 $2 个结果。');
            text = text.replace(/Showing ([\d,]+) results?/, '共 $1 个结果');
            text = text.replace(/Rate as ([\d\.]+) stars?/, '$1 星');
            text = text.replace(/([\d,]+) torrent was found for this gallery./, '找到了 $1 个种子。');
            text = text.replace(/([\d,]+) \/ ([\d,]+) favorite note slots? used./, '已经使用了 $1 个便签，共 $2 个。');
            text = text.replace(/Showing results for ([\d,]+) watched tags?/, '订阅的 $1 个标签的结果');
            text = text.replace(/Showing ([\d,]+)-([\d,]+) of ([\d,]+)/, '$1 - $2，共 $3 个结果');
            if (node.textContent !== text) {
                node.textContent = text;
                return;
            }

        } else if (this.isNode(node, 'input') || this.isNode(node, 'textarea')) {
            if (uiData[node.placeholder]) {
                node.placeholder = uiData[node.placeholder];
                return;
            }
            if (node.type === 'submit' || node.type === 'button') {
                if (uiData[node.value]) {
                    node.value = uiData[node.value];
                    return;
                }
            }
        } else if (this.isNode(node, 'optgroup')) {
            if (uiData[node.label]) {
                node.label = uiData[node.label];
            }
        }

        if (
            this.isNode(node, 'a') &&
            node.parentElement &&
            node.parentElement.parentElement &&
            node.parentElement.parentElement.id === 'nb') {
            if (uiData[node.textContent]) {
                node.textContent = uiData[node.textContent];
                return;
            }
        }

        if (this.isNode(node, 'p')) {
            /* 兼容熊猫书签，单独处理页码，保留原页码Element，防止熊猫书签取不到报错*/
            if (node.classList.contains('gpc')) {
                const text = node.textContent;
                node.style.display = 'none';
                const p = document.createElement('p');
                p.textContent = text.replace(/Showing ([\d,]+) - ([\d,]+) of ([\d,]+) images?/, '$1 - $2，共 $3 张图片');
                p.className = 'gpc-translate';
                node.parentElement.insertBefore(p, node);
            }
        }

        if (this.isNode(node, 'div')) {
            /* E-Hentai-Downloader 兼容处理 */
            if (node.id === 'gdd') {
                const div = document.createElement('div');
                div.textContent = node.textContent;
                div.style.display = 'none';
                node.insertBefore(div, null);
            }

            /* 熊猫书签 兼容处理 2 */
            if (
                node.parentElement &&
                node.parentElement.id === 'gdo4' &&
                node.classList.contains('ths') &&
                node.classList.contains('nosel')
            ) {
                const div = document.createElement('div');
                div.textContent = node.textContent;
                div.style.display = 'none';
                div.className = 'ths';
                node.parentElement.insertBefore(div, node);
            }
        }

    }
}

export const syringe = new Syringe();
