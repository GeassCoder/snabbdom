// jshint newcap: false
/* global require, module, document, Node */
'use strict';

function isUndef(s) { return s === undefined; }
function isDef(s) { return s !== undefined; }

var emptyNode = VNode('', {}, [], undefined, undefined);

function sameVnode(vnode1, vnode2) {
  return vnode1.key === vnode2.key && vnode1.sel === vnode2.sel;
}

function createKeyToOldIdx(children, beginIdx, endIdx) {
  var i, map = {}, key;
  for (i = beginIdx; i <= endIdx; ++i) {
    key = children[i].key;
    if (isDef(key)) map[key] = i;
  }
  return map;
}

var hooks = ['create', 'update', 'remove', 'destroy', 'pre', 'post'];

function init(modules, api) {
  var i, j, cbs = {};

  if (isUndef(api)) {
    api = domApi;
  }

  for (i = 0; i < hooks.length; ++i) {
    cbs[hooks[i]] = [];

    for (j = 0; j < modules.length; ++j) {
      if (modules[j][hooks[i]] !== undefined) {
        cbs[hooks[i]].push(modules[j][hooks[i]]);
      }
    }
  }

  function emptyNodeAt(elm) {
    var id = elm.id ? '#' + elm.id : '';

    var c = elm.className ? 
      '.' + elm.className.split(' ').join('.') :
      '';

    return VNode(
      api.tagName(elm).toLowerCase() + id + c, 
      {}, 
      [], 
      undefined, 
      elm
    );
  }

  function createRmCb(childElm, listeners) {
    return function() {
      if (--listeners === 0) {
        var parent = api.parentNode(childElm);
        api.removeChild(parent, childElm);
      }
    };
  }

  function createElm(vnode, insertedVnodeQueue) {
    var i, 
      data = vnode.data;

    if (isDef(data)) {
      if (isDef(i = data.hook) && isDef(i = i.init)) {
        i(vnode);
        data = vnode.data;
      }
    }

    var elm, 
      children = vnode.children, 
      sel = vnode.sel;

    // sel exists, not a text node
    if (isDef(sel)) {
      // Parse selector
      var hashIdx = sel.indexOf('#');
      var dotIdx = sel.indexOf('.', hashIdx);
      var hash = hashIdx > 0 ? hashIdx : sel.length;
      var dot = dotIdx > 0 ? dotIdx : sel.length;
      var tag = (hashIdx !== -1 || dotIdx !== -1) ? 
        sel.slice(0, Math.min(hash, dot)) : 
        sel;

      // create dom element
      elm = vnode.elm = (isDef(data) && isDef(i = data.ns)) ? 
        api.createElementNS(i, tag): 
        api.createElement(tag);

      // set id
      if (hash < dot) {
        elm.id = sel.slice(hash + 1, dot);
      }

      // set class
      if (dotIdx > 0) {
        elm.className = sel.slice(dot + 1).replace(/\./g, ' ');
      }

      // add children
      if (is.array(children)) {
        for (i = 0; i < children.length; ++i) {
          api.appendChild(elm, createElm(children[i], insertedVnodeQueue));
        }
      // add text
      } else if (is.primitive(vnode.text)) {
        api.appendChild(elm, api.createTextNode(vnode.text));
      }

      // call global create hooks
      for (i = 0; i < cbs.create.length; ++i) {
        cbs.create[i](emptyNode, vnode);
      }

      i = vnode.data.hook; // Reuse variable

      // take care vnode level hooks
      if (isDef(i)) {
        // call vnode create hooks
        if (i.create) {
          i.create(emptyNode, vnode);
        }

        // prepare vnode insert hooks
        if (i.insert) {
          insertedVnodeQueue.push(vnode);
        }
      }

    // sel doesn't exist, must be text node
    } else {
      elm = vnode.elm = api.createTextNode(vnode.text);
    }

    return vnode.elm;
  }

  function addVnodes(parentElm, before, vnodes, startIdx, endIdx, insertedVnodeQueue) {
    for (; startIdx <= endIdx; ++startIdx) {
      // signature: insertBefore(parentNode, newNode, referenceNode)
      api.insertBefore(parentElm, createElm(vnodes[startIdx], insertedVnodeQueue), before);
    }
  }

  function invokeDestroyHook(vnode) {
    var i, j, data = vnode.data;
    if (isDef(data)) {
      // take care vnode level destroy hooks
      if (isDef(i = data.hook) && isDef(i = i.destroy)) {
        i(vnode);
      }

      // call global destroy hooks
      for (i = 0; i < cbs.destroy.length; ++i) {
        cbs.destroy[i](vnode);
      }

      // apply to children recursively
      if (isDef(i = vnode.children)) {
        for (j = 0; j < vnode.children.length; ++j) {
          invokeDestroyHook(vnode.children[j]);
        }
      }
    }
  }

  function removeVnodes(parentElm, vnodes, startIdx, endIdx) {
    // remove all from startIdx to endIdx
    for (; startIdx <= endIdx; ++startIdx) {
      var i, listeners, rm, ch = vnodes[startIdx];

      if (isDef(ch)) {

        // if has selector, then should be an html element (not text node)
        if (isDef(ch.sel)) {
          invokeDestroyHook(ch);

          // all the remove hooks, global + vnode level (=1)
          // in fact it's maximum of remove hooks since there may not exist vnode level remove hook
          listeners = cbs.remove.length + 1;
          // rm is the function that can REALLY remove the element from the dom, given the counter is decremented to 0
          rm = createRmCb(ch.elm, listeners); 

          // call global remove hooks
          for (i = 0; i < cbs.remove.length; ++i) {
            cbs.remove[i](ch, rm);
          }

          // call vnode level remove hook
          if (isDef(i = ch.data) && isDef(i = i.hook) && isDef(i = i.remove)) {
            i(ch, rm);
          // since there is no vnode level remove hook, need to call this manually because this was already counted in listeners regardlessly
          } else {
            rm();
          }

        // text node
        } else {
          api.removeChild(parentElm, ch.elm);
        }
      }
    }
  }

  function updateChildren(parentElm, oldCh, newCh, insertedVnodeQueue) {
    var oldStartIdx = 0, newStartIdx = 0;
    var oldEndIdx = oldCh.length - 1;
    var oldStartVnode = oldCh[0];
    var oldEndVnode = oldCh[oldEndIdx];
    var newEndIdx = newCh.length - 1;
    var newStartVnode = newCh[0];
    var newEndVnode = newCh[newEndIdx];
    var oldKeyToIdx, idxInOld, elmToMove, before;

    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
      // see case *
      // old start is already moved
      if (isUndef(oldStartVnode)) {
        // old start ->
        oldStartVnode = oldCh[++oldStartIdx]; // Vnode has been moved left

      // see case *
      // old end is already moved
      } else if (isUndef(oldEndVnode)) {
        // old end <-
        oldEndVnode = oldCh[--oldEndIdx];

      // old start and new start are similar (have same selector and key)
      } else if (sameVnode(oldStartVnode, newStartVnode)) {
        patchVnode(oldStartVnode, newStartVnode, insertedVnodeQueue);
        // old start ->
        oldStartVnode = oldCh[++oldStartIdx];
        // new start ->
        newStartVnode = newCh[++newStartIdx];

      // old end and new end are similar (have same selector and key)
      } else if (sameVnode(oldEndVnode, newEndVnode)) {
        patchVnode(oldEndVnode, newEndVnode, insertedVnodeQueue);
        // old end <-
        oldEndVnode = oldCh[--oldEndIdx];
        // new end <-
        newEndVnode = newCh[--newEndIdx];

      // old start and new end are similar
      } else if (sameVnode(oldStartVnode, newEndVnode)) { // Vnode moved right
        patchVnode(oldStartVnode, newEndVnode, insertedVnodeQueue);
        // note: when api.nextSibling(oldEndVnode.elm) doesn't exist (returns null), it inserts the element at the end of parentElm, which is desired
        api.insertBefore(parentElm, oldStartVnode.elm, api.nextSibling(oldEndVnode.elm));
        // old start ->
        oldStartVnode = oldCh[++oldStartIdx];
        // new end <-
        newEndVnode = newCh[--newEndIdx];

      // old end and new start are similar
      } else if (sameVnode(oldEndVnode, newStartVnode)) { // Vnode moved left
        patchVnode(oldEndVnode, newStartVnode, insertedVnodeQueue);
        api.insertBefore(parentElm, oldEndVnode.elm, oldStartVnode.elm);
        // old end <-
        oldEndVnode = oldCh[--oldEndIdx];
        // new start ->
        newStartVnode = newCh[++newStartIdx];

      // case *: no match from the 4 previous checks
      } else {

        // create map for all old vnodes between old start index and old end index
        if (isUndef(oldKeyToIdx)) {
          oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx);
        }

        // get new start key's index in old[]
        idxInOld = oldKeyToIdx[newStartVnode.key];

        // if new start is not similar to one in the range between old start index and old end index, i.e. new start is a new vnode that doesn't exist in old vnodes[]
        if (isUndef(idxInOld)) { // New element
          // insert before old start
          api.insertBefore(parentElm, createElm(newStartVnode, insertedVnodeQueue), oldStartVnode.elm);

          // new start ->
          newStartVnode = newCh[++newStartIdx];

        // if new start is in range between old start index and old end index, i.e. there is a match of new start in old[oldStart..oldEnd]
        } else {
          // get the match in old[]
          elmToMove = oldCh[idxInOld];
          // patch
          patchVnode(elmToMove, newStartVnode, insertedVnodeQueue);
          // set the position of match to undefined, so that when old start or old end reaches this position it knows this node has been taken care of and can skip it
          oldCh[idxInOld] = undefined;
          // insert match before old start
          api.insertBefore(parentElm, elmToMove.elm, oldStartVnode.elm);
          // new start ->
          newStartVnode = newCh[++newStartIdx];
        }
      }
    }

    // finished looping through old children[]
    if (oldStartIdx > oldEndIdx) {
      // make sure passing null in insertBefore() later, if pass undefined it won't work correctly
      before = isUndef(newCh[newEndIdx+1]) ? null : newCh[newEndIdx+1].elm;

      // insert all the left in new[] (i.e. from new start to new end), these are new added children that don't exist on old vndoe
      addVnodes(parentElm, before, newCh, newStartIdx, newEndIdx, insertedVnodeQueue);

    // finished looping through new children[]
    } else if (newStartIdx > newEndIdx) {
      // remove old children between old start and old end, these are not in new children[] and so should not exist any more
      removeVnodes(parentElm, oldCh, oldStartIdx, oldEndIdx);
    }
  }

  function patchVnode(oldVnode, vnode, insertedVnodeQueue) {
    var i, hook;

    // call vnode level prepatch hooks
    if (isDef(i = vnode.data) && isDef(hook = i.hook) && isDef(i = hook.prepatch)) {
      i(oldVnode, vnode);
    }

    // sync element
    var elm = vnode.elm = oldVnode.elm, 
      oldCh = oldVnode.children, 
      ch = vnode.children;

    // if they are the same
    if (oldVnode === vnode) {
      return;
    }

    // not the same, replace old vnode element with vnode element
    if (!sameVnode(oldVnode, vnode)) {
      var parentElm = api.parentNode(oldVnode.elm);
      elm = createElm(vnode, insertedVnodeQueue);
      api.insertBefore(parentElm, elm, oldVnode.elm);
      removeVnodes(parentElm, [oldVnode], 0, 0);
      return;
    }

    // if they have same selector and key (note elemnt was synced already)

    // if vnode has data
    if (isDef(vnode.data)) {
      // call globel update hooks
      for (i = 0; i < cbs.update.length; ++i) {
        cbs.update[i](oldVnode, vnode);
      }

      // call vnode level update hooks
      i = vnode.data.hook;
      if (isDef(i) && isDef(i = i.update)) {
        i(oldVnode, vnode);
      }
    }

    // if vnode has no text
    if (isUndef(vnode.text)) {
      // both vnode and old vnode have children
      if (isDef(oldCh) && isDef(ch)) {
        // children changed, update
        if (oldCh !== ch) {
          updateChildren(elm, oldCh, ch, insertedVnodeQueue);
        }

      // old vnode has no children, vnode has children
      } else if (isDef(ch)) {
        // if old vnode has text node, remove text
        if (isDef(oldVnode.text)) {
          api.setTextContent(elm, '');
        }

        // add all children
        addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue);

      // old vnode has children, vnode has no children
      } else if (isDef(oldCh)) {
        // remove all children
        removeVnodes(elm, oldCh, 0, oldCh.length - 1);

      // old vnode has text, vnode has no text, remove text
      } else if (isDef(oldVnode.text)) {
        api.setTextContent(elm, '');
      }

    // vnode has text, but is different from old vnode's text, update
    } else if (oldVnode.text !== vnode.text) {
      api.setTextContent(elm, vnode.text);
    }

    // take care of vnode level postpatch hooks
    if (isDef(hook) && isDef(i = hook.postpatch)) {
      i(oldVnode, vnode);
    }
  }

  return function patch (oldVnode, vnode) {
    var i, elm, parent;
    var insertedVnodeQueue = [];

    // call global pre hooks (at the beginning of patch)
    for (i = 0; i < cbs.pre.length; ++i) {
      cbs.pre[i]();
    }

    // selector doesn't exist, then should be a dom node, convert it to a vnode with other info but element empty
    if (isUndef(oldVnode.sel)) {
      oldVnode = emptyNodeAt(oldVnode);
    }

    // if they are same (i.e. sel and key are same)
    if (sameVnode(oldVnode, vnode)) {
      patchVnode(oldVnode, vnode, insertedVnodeQueue);

    // replace old vnode with vnode
    } else {
      elm = oldVnode.elm;
      parent = api.parentNode(elm);

      // this has a side effect that the new created element (or text node) is set to vnode.element
      createElm(vnode, insertedVnodeQueue);

      // replace current element with new element
      if (parent !== null) {
        // ?? no need to call api.nextSibling() here
        api.insertBefore(parent, vnode.elm, api.nextSibling(elm));
        removeVnodes(parent, [oldVnode], 0, 0);
      }
    }

    // call vnode level insert hooks (note that there are no global insert hooks)
    for (i = 0; i < insertedVnodeQueue.length; ++i) {
      insertedVnodeQueue[i].data.hook.insert(insertedVnodeQueue[i]);
    }

    // call global post hooks (when patch process is done)
    for (i = 0; i < cbs.post.length; ++i) {
      cbs.post[i]();
    }
  };

module.exports = {init: init};
