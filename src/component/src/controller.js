/**
 * @fileOverview Base Controller class for KISSY Component.
 * @author yiminghe@gmail.com
 */
KISSY.add("component/controller", function (S, Event, Component, UIBase, Manager, Render, undefined) {

    function wrapperViewSetter(attrName) {
        return function (ev) {
            var self = this;
            // in case bubbled from sub component
            if (self == ev.target) {
                var value = ev.newVal,
                    view = self.get("view");
                view.set(attrName, value);
            }
        };
    }

    function wrapperViewGetter(attrName) {
        return function (v) {
            var self = this,
                view = self.get("view");
            return v === undefined ? view.get(attrName) : v;
        };
    }

    function initChild(self, c, renderBefore) {
        // 生成父组件的 dom 结构
        self.create();
        var contentEl = self.getContentElement();
        c = Component.create(c, self);
        c.__set("parent", self);
        // set 通知 view 也更新对应属性
        c.set("render", contentEl);
        c.set("elBefore", renderBefore);
        // 如果 parent 也没渲染，子组件 create 出来和 parent 节点关联
        // 子组件和 parent 组件一起渲染
        // 之前设好属性，view ，logic 同步还没 bind ,create 不是 render ，还没有 bindUI
        c.create(undefined);
        return c;
    }

    /**
     * 不使用 valueFn，
     * 只有 render 时需要找到默认，其他时候不需要，防止莫名其妙初始化
     * @ignore
     */
    function constructView(self) {
        // 逐层找默认渲染器
        var attrs,
            attrCfg,
            attrName,
            cfg = {},
            v,
            Render = self.get('xrender');

        /**
         * 将渲染层初始化所需要的属性，直接构造器设置过去
         */
        attrs = self.getAttrs();

        // 整理属性，对纯属于 view 的属性，添加 getter setter 直接到 view
        for (attrName in attrs) {
            if (attrs.hasOwnProperty(attrName)) {
                attrCfg = attrs[attrName];
                if (attrCfg.view) {

                    // 先取后 getter
                    // 防止死循环
                    if (( v = self.get(attrName) ) !== undefined) {
                        cfg[attrName] = v;
                    }

                    // setter 不应该有实际操作，仅用于正规化比较好
                    // attrCfg.setter = wrapperViewSetter(attrName);
                    self.on("after" + S.ucfirst(attrName) + "Change",
                        wrapperViewSetter(attrName));
                    // 逻辑层读值直接从 view 层读
                    // 那么如果存在默认值也设置在 view 层
                    // 逻辑层不要设置 getter
                    attrCfg.getter = wrapperViewGetter(attrName);
                }
            }
        }
        // does not autoRender for view
        delete cfg.autoRender;
        cfg.ksComponentCss = getComponentCss(self);
        return new Render(cfg);
    }

    function getComponentCss(self) {
        var constructor = self.constructor,
            cls,
            re = [];
        while (constructor && constructor != Controller) {
            cls = Manager.getXClassByConstructor(constructor);
            if (cls) {
                re.push(cls);
            }
            constructor = constructor.superclass && constructor.superclass.constructor;
        }
        return re.join(" ");
    }

    function isMouseEventWithinElement(e, elem) {
        var relatedTarget = e.relatedTarget;
        // 在里面或等于自身都不算 mouseenter/leave
        return relatedTarget &&
            ( relatedTarget === elem[0] ||
                elem.contains(relatedTarget) );
    }

    function wrapBehavior(self, action) {
        return self["__ks_wrap_" + action] = function (e) {
            if (!self.get("disabled")) {
                self[action](e);
            }
        };
    }

    function getWrapBehavior(self, action) {
        return self["__ks_wrap_" + action];
    }

    /**
     * Base Controller class for KISSY Component.
     * xclass: 'controller'.
     * @extends Component.UIBase
     * @mixins Component.UIBase.Box
     * @class Component.Controller
     */
    var Controller = UIBase.extend([UIBase.Box],
        {

            /**
             * Get full class name for current component
             * @param classes {String} class names without prefixCls. Separated by space.
             * @method
             * @protected
             * @return {String} class name with prefixCls
             */
            getCssClassWithPrefix:Manager.getCssClassWithPrefix,

            /**
             * From UIBase, Initialize this component.             *
             * @protected
             */
            initializer:function () {
                // initialize view
                this.__set("view", constructView(this));
            },

            /**
             * From UIBase. Constructor(or get) view object to create ui elements.
             * @protected
             *
             */
            createDom:function () {
                var self = this,
                    el,
                    view = self.get("view");
                view.create(undefined);
                el = view.getKeyEventTarget();
                if (!self.get("allowTextSelection")) {
                    el.unselectable(undefined);
                }
            },

            /**
             * From UIBase. Call view object to render ui elements.
             * @protected
             *
             */
            renderUI:function () {
                var self = this, i, children, child;
                self.get("view").render();
                // then render my children
                children = self.get("children").concat();
                self.get("children").length = 0;
                for (i = 0; i < children.length; i++) {
                    child = self.addChild(children[i]);
                    child.render();
                }
            },

            _uiSetFocusable:function (focusable) {
                var self = this,
                    t,
                    el = self.getKeyEventTarget();
                if (focusable) {
                    el.attr("tabIndex", 0)
                        // remove smart outline in ie
                        // set outline in style for other standard browser
                        .attr("hideFocus", true)
                        .on("focus", wrapBehavior(self, "handleFocus"))
                        .on("blur", wrapBehavior(self, "handleBlur"))
                        .on("keydown", wrapBehavior(self, "handleKeydown"));
                } else {
                    el.removeAttr("tabIndex");
                    if (t = getWrapBehavior(self, "handleFocus")) {
                        el.detach("focus", t);
                    }
                    if (t = getWrapBehavior(self, "handleBlur")) {
                        el.detach("blur", t);
                    }
                    if (t = getWrapBehavior(self, "handleKeydown")) {
                        el.detach("keydown", t);
                    }
                }
            },

            _uiSetHandleMouseEvents:function (handleMouseEvents) {
                var self = this, el = self.get("el"), t;
                if (handleMouseEvents) {
                    el.on("mouseenter", wrapBehavior(self, "handleMouseEnter"))
                        .on("mouseleave", wrapBehavior(self, "handleMouseLeave"))
                        .on("contextmenu", wrapBehavior(self, "handleContextMenu"))
                        .on("mousedown", wrapBehavior(self, "handleMouseDown"))
                        .on("mouseup", wrapBehavior(self, "handleMouseUp"))
                        .on("dblclick", wrapBehavior(self, "handleDblClick"));
                } else {
                    t = getWrapBehavior(self, "handleMouseEnter") &&
                        el.detach("mouseenter", t);
                    t = getWrapBehavior(self, "handleMouseLeave") &&
                        el.detach("mouseleave", t);
                    t = getWrapBehavior(self, "handleContextMenu") &&
                        el.detach("contextmenu", t);
                    t = getWrapBehavior(self, "handleMouseDown") &&
                        el.detach("mousedown", t);
                    t = getWrapBehavior(self, "handleMouseUp") &&
                        el.detach("mouseup", t);
                    t = getWrapBehavior(self, "handleDblClick") &&
                        el.detach("dblclick", t);
                }
            },

            _uiSetFocused:function (v) {
                if (v) {
                    this.getKeyEventTarget()[0].focus();
                }
            },

            /**
             * 子组件将要渲染到的节点，在 render 类上覆盖对应方法
             * @ignore
             */
            getContentElement:function () {
                return this.get('view').getContentElement();
            },

            /**
             * 焦点所在元素即键盘事件处理元素，在 render 类上覆盖对应方法
             * @ignore
             */
            getKeyEventTarget:function () {
                return this.get('view').getKeyEventTarget();
            },

            /**
             * Add the specified component as a child of current component
             * at the given 0-based index.
             * @param {Component.Controller|Object} c
             * Child component instance to be added
             * or
             * Object describe child component
             * @param {String} [c.xclass] When c is a object, specify its child class.
             * @param {Number} [index]  0-based index at which
             * the new child component is to be inserted;
             * If not specified , the new child component will be inserted at last position.
             */
            addChild:function (c, index) {
                var self = this,
                    children = self.get("children"),
                    renderBefore;
                if (index === undefined) {
                    index = children.length;
                }
                renderBefore = children[index] && children[index].get("el") || null;
                c = initChild(self, c, renderBefore);
                children.splice(index, 0, c);
                // 先 create 占位 再 render
                // 防止 render 逻辑里读 parent.get("children") 不同步
                // 如果 parent 已经渲染好了子组件也要立即渲染，就 创建 dom ，绑定事件
                if (self.get("rendered")) {
                    c.render();
                }
                self.fire("addChild", {
                    child:c
                });
                return c;
            },

            /**
             * Removed the given child from this component,and returns it.
             *
             * If destroy is true, calls {@link Component.UIBase.#destroy} on the removed child component,
             * and subsequently detaches the child's DOM from the document.
             * Otherwise it is the caller's responsibility to
             * clean up the child component's DOM.
             *
             * @param {Component.Controller} c The child component to be removed.
             * @param {Boolean} [destroy=false] If true,
             * calls {@link Component.UIBase.#destroy} on the removed child component.
             * @return {Component.Controller} The removed component.
             */
            removeChild:function (c, destroy) {
                var self = this,
                    children = self.get("children"),
                    index = S.indexOf(c, children);
                if (index != -1) {
                    children.splice(index, 1);
                }
                if (destroy &&
                    // c is still json
                    c.destroy) {
                    c.destroy();
                }
                self.fire("removeChild", {
                    child:c
                });
                return c;
            },

            /**
             * Removes every child component attached to current component.
             * @see Component.Controller#removeChild
             * @param {Boolean} [destroy] If true,
             * calls {@link Component.UIBase.#destroy} on the removed child component.
             */
            removeChildren:function (destroy) {
                var self = this,
                    i,
                    t = [].concat(self.get("children"));
                for (i = 0; i < t.length; i++) {
                    self.removeChild(t[i], destroy);
                }
            },

            /**
             * Returns the child at the given index, or null if the index is out of bounds.
             * @param {Number} index 0-based index.
             * @return {Component.Controller} The child at the given index; null if none.
             */
            getChildAt:function (index) {
                var children = this.get("children");
                return children[index] || null;
            },

            /**
             * Handle dblclick events. By default, this performs its associated action by calling
             * {@link Component.Controller#performActionInternal}.
             * @protected
             * @param {Event.Object} ev DOM event to handle.
             */
            handleDblClick:function (ev) {
                this.performActionInternal(ev);
            },

            /**
             * Called by it's container component to dispatch mouseenter event.
             * @private
             * @param {Event.Object} ev DOM event to handle.
             */
            handleMouseOver:function (ev) {
                var self = this,
                    el = self.get("el");
                if (!isMouseEventWithinElement(ev, el)) {
                    self.handleMouseEnter(ev);
                }
            },

            /**
             * Called by it's container component to dispatch mouseleave event.
             * @private
             * @param {Event.Object} ev DOM event to handle.
             */
            handleMouseOut:function (ev) {
                var self = this,
                    el = self.get("el");
                if (!isMouseEventWithinElement(ev, el)) {
                    self.handleMouseLeave(ev);
                }
            },

            /**
             * Handle mouseenter events. If the component is not disabled, highlights it.
             * @protected
             * @param {Event.Object} ev DOM event to handle.
             */
            handleMouseEnter:function (ev) {
                this.set("highlighted", !!ev);
            },

            /**
             * Handle mouseleave events. If the component is not disabled, de-highlights it.
             * @protected
             * @param {Event.Object} ev DOM event to handle.
             */
            handleMouseLeave:function (ev) {
                var self = this;
                self.set("active", false);
                self.set("highlighted", !ev);
            },

            /**
             * Handles mousedown events. If the component is not disabled,
             * If the component is activeable, then activate it.
             * If the component is focusable, then focus it,
             * else prevent it from receiving keyboard focus.
             * @protected
             * @param {Event.Object} ev DOM event to handle.
             */
            handleMouseDown:function (ev) {
                var self = this,
                    n,
                    isMouseActionButton = ev['which'] == 1,
                    el;
                if (isMouseActionButton) {
                    el = self.getKeyEventTarget();
                    if (self.get("activeable")) {
                        self.set("active", true);
                    }
                    if (self.get("focusable")) {
                        el[0].focus();
                        self.set("focused", true);
                    }

                    if (!self.get("allowTextSelection")) {
                        // firefox /chrome 不会引起焦点转移
                        n = ev.target.nodeName;
                        n = n && n.toLowerCase();
                        // do not prevent focus when click on editable element
                        if (n != "input" && n != "textarea") {
                            ev.preventDefault();
                        }
                    }
                }
            },

            /**
             * Handles mouseup events.
             * If this component is not disabled, performs its associated action by calling
             * {@link Component.Controller#performActionInternal}, then deactivates it.
             * @protected
             * @param {Event.Object} ev DOM event to handle.
             */
            handleMouseUp:function (ev) {
                var self = this;
                // 左键
                if (self.get("active") && ev.which == 1) {
                    self.performActionInternal(ev);
                    self.set("active", false);
                }
            },

            /**
             * Handles context menu.
             * @protected
             * @param {Event.Object} ev DOM event to handle.
             */
            handleContextMenu:function (ev) {
            },

            /**
             * Handles focus events. Style focused class.
             * @protected
             * @param {Event.Object} ev DOM event to handle.
             */
            handleFocus:function (ev) {
                this.set("focused", !!ev);
                this.fire("focus");
            },

            /**
             * Handles blur events. Remove focused class.
             * @protected
             * @param {Event.Object} ev DOM event to handle.
             */
            handleBlur:function (ev) {
                this.set("focused", !ev);
                this.fire("blur");
            },

            /**
             * Handle enter keydown event to {@link Component.Controller#performActionInternal}.
             * @protected
             * @param {Event.Object} ev DOM event to handle.
             */
            handleKeyEventInternal:function (ev) {
                if (ev.keyCode == Event.KeyCodes.ENTER) {
                    return this.performActionInternal(ev);
                }
            },

            /**
             * Handle keydown events.
             * If the component is not disabled, call {@link Component.Controller#handleKeyEventInternal}
             * @protected
             * @param {Event.Object} ev DOM event to handle.
             */
            handleKeydown:function (ev) {
                var self = this;
                if (self.handleKeyEventInternal(ev)) {
                    ev.halt();
                    return true;
                }
            },

            /**
             * Performs the appropriate action when this component is activated by the user.
             * @protected
             * @param {Event.Object} ev DOM event to handle.
             */
            performActionInternal:function (ev) {
            },

            destructor:function () {
                var self = this,
                    i,
                    view,
                    children = self.get("children");
                for (i = 0; i < children.length; i++) {
                    children[i].destroy && children[i].destroy();
                }
                self.get("view").destroy();
            }
        },
        {
            ATTRS:{

                /**
                 * Enables or disables mouse event handling for the component.
                 * Containers may set this attribute to disable mouse event handling
                 * in their child component.
                 * @default true.
                 * @type {Boolean}
                 * @protected
                 */
                handleMouseEvents:{
                    value:true
                },

                /**
                 * Whether this component can get focus.
                 * @default true.
                 * @protected
                 * @type {Boolean}
                 */
                focusable:{
                    value:true,
                    view:1
                },

                /**
                 * 1. Whether allow select this component's text.<br/>
                 * 2. Whether not to lose last component's focus if click current one (set false).
                 *
                 * Defaults to: false.
                 * @type {Boolean}
                 * @property allowTextSelection
                 * @protected
                 */


                /**
                 * @ignore
                 */
                allowTextSelection:{
                    // 和 focusable 分离
                    // grid 需求：容器允许选择里面内容
                    value:false
                },

                /**
                 * Whether this component can be activated.
                 * @default true.
                 * @type {Boolean}
                 * @protected
                 */
                activeable:{
                    value:true
                },

                /**
                 * Whether this component has focus.
                 * @type {Boolean}
                 */
                focused:{
                    view:1
                },

                /**
                 * Whether this component is activated.
                 * @type {Boolean}
                 */
                active:{
                    view:1
                },

                /**
                 * Whether this component is highlighted.
                 * @type {Boolean}
                 */
                highlighted:{
                    view:1
                },

                /**
                 * Array of child components
                 * @type {Component.Controller[]}
                 */
                children:{
                    value:[]
                },

                /**
                 * This component's prefix css class.
                 * @type {String}
                 */
                prefixCls:{
                    value:'ks-', // box srcNode need
                    view:1
                },

                /**
                 * This component's parent component.
                 * @type {Component.Controller}
                 */
                parent:{
                    setter:function (p) {
                        // 事件冒泡源
                        this.addTarget(p);
                    }
                },

                /**
                 * Whether this component is disabled.
                 * @type {Boolean}
                 */
                disabled:{
                    view:1
                },

                /**
                 * Render class.
                 * @protected
                 * @type {Component.Render}
                 */
                xrender:{
                    value:Render
                }
            }
        }, {
            xclass:'controller'
        });

    return Controller;
}, {
    requires:['event', './base', './uibase', './manager', './render']
});
/*
 事件冒泡机制
 - child 组件的冒泡源配置为其所属的 parent
 - 性能考虑:不是 child 的所有事件都冒泡到 parent，要具体配置哪些事件需要冒泡

 view 和 controller 的平行关系
 - controller 初始化 -> initializer -> new view()
 - controller createDom -> createDom -> view.createDom()
 - controller renderUI -> renderUI -> view.render()


 控制层元属性配置中 view 的作用
 - 如果没有属性变化处理函数，自动生成属性变化处理函数，自动转发给 view 层
 - 如果没有指定 view 层实例，在生成默认 view 实例时，所有用户设置的 view 的属性都转到默认 view 实例中


 observer synchronization, model 分成两类
 - view 负责监听 view 类 model 变化更新界面
 - control 负责监听 control 类变化改变逻辑



 problem: Observer behavior is hard to understand and debug
 because it's implicit behavior.

 Keeping screen state and session state synchronized is an important task
 Data Binding.

 In general data binding gets tricky
 because if you have to avoid cycles where a change to the control,
 changes the record set, which updates the control,
 which updates the record set....
 The flow of usage helps avoid these -
 we load from the session state to the screen when the screen is opened,
 after that any changes to the screen state propagate back to the session state.
 It's unusual for the session state to be updated directly once the screen is up.
 As a result data binding might not be entirely bi-directional -
 just confined to initial upload and
 then propagating changes from the controls to the session state.

 Refer
 - http://martinfowler.com/eaaDev/uiArchs.html

 */