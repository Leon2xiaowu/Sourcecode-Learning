/* AlloyTouch v0.2.5
 * By AlloyTeam http://www.alloyteam.com/
 * Github: https://github.com/AlloyTeam/AlloyTouch
 * MIT Licensed.
 */
// ===== Start => 兼容不支持requestAnimationFrame的浏览器环境, 采用setTimeout的降级处理 =====
;(function () {
    'use strict';

    if (!Date.now)
        Date.now = function () { return new Date().getTime(); };

    var vendors = ['webkit', 'moz'];
    for (var i = 0; i < vendors.length && !window.requestAnimationFrame; ++i) {
        var vp = vendors[i];
        window.requestAnimationFrame = window[vp + 'RequestAnimationFrame'];
        window.cancelAnimationFrame = (window[vp + 'CancelAnimationFrame']
                                   || window[vp + 'CancelRequestAnimationFrame']);
    }
    if (/iP(ad|hone|od).*OS 6/.test(window.navigator.userAgent) // iOS6 is buggy
        || !window.requestAnimationFrame || !window.cancelAnimationFrame) {
        var lastTime = 0;
        window.requestAnimationFrame = function (callback) {
            var now = Date.now();
            var nextTime = Math.max(lastTime + 16, now);
            return setTimeout(function () { callback(lastTime = nextTime); },
                              nextTime - now);
        };
        window.cancelAnimationFrame = clearTimeout;
    }
}());
// ===== End => 兼容不支持requestAnimationFrame的浏览器环境, 采用setTimeout的降级处理 =====


(function () {
    // ===== 封装事件监听函数 =====
    function bind(element, type, callback) {
        element.addEventListener(type, callback, false);
    }
    // ===== 运动使用的缓动函数，根据x求y。即如下图所示，一个先加速再减速的过程，用来模拟摩擦力非常合适，当然回弹也是用的这段缓动。 =====
    function ease(x) {
        return Math.sqrt(1 - Math.pow(x - 1, 2));
    }
    // ===== 逆向缓动，根据y的值求x。和上面的缓动函数相反。注意这里求解出来y有两个值。
    // ===== 即1 - Math.sqrt(1 - y * y)和1 + Math.sqrt(1 - y * y)。 
    // ===== 1 + Math.sqrt(1 - y * y)大于1，所以不采用。使用1 - Math.sqrt(1 - y * y)。 
    /**
     * 这个函数主要用于当运动超出min和max边界不能完整完成一次运动过程的时候求出其中不完整的路程的消耗的时间。
     *
     * @param {*} y
     * @returns
     */
    function reverseEase(y) {
        return 1 - Math.sqrt(1 - y * y);
    }

    /**
     * 检测DOM是否在(INPUT|TEXTAREA|BUTTON|SELECT)之中
     * 是的话不会阻止DOM的默认事件
     * 否则会导致这些DOM不可点击
     * @param {*} el 判断的DOM
     * @param {*} exceptions 正则表达式,匹配(INPUT|TEXTAREA|BUTTON|SELECT)
     * @returns
     */
    function preventDefaultTest(el, exceptions) {
        for (var i in exceptions) {
            if (exceptions[i].test(el[i])) {
                return true;
            }
        }
        return false;
    }

    var AlloyTouch = function (option) {
        // ===== 用户触摸的对象
        this.element = typeof option.touch === "string" ? document.querySelector(option.touch) : option.touch;
        // ===== 触摸后进行反馈, 移动的DOM
        this.target = this._getValue(option.target, this.element);
        // ===== target移动的方向, 默认true为垂直; false为水平
        this.vertical = this._getValue(option.vertical, true);
        // ===== 运动的属性; TranslateY/X
        this.property = option.property;
        this.tickID = 0;
        // ===== 运动的属性this.property的初始值
        this.initialValue = this._getValue(option.initialValue, this.target[this.property]);
        // ===== 设置移动对象的运动属性为默认值
        this.target[this.property] = this.initialValue;
        // ===== 关闭滚动 True的时候就不滚啦
        this.fixed = this._getValue(option.fixed, false);
        // ===== 灵敏度
        this.sensitivity = this._getValue(option.sensitivity, 1);
        // ===== 表示触摸位移运动位移与被运动属性映射关系，默认值是1 摩擦系数
        this.moveFactor = this._getValue(option.moveFactor, 1);
        // ===== 表示触摸位移运动位移与被运动属性映射关系，默认值是1
        this.factor = this._getValue(option.factor, 1);
        // ===== 滚动超过边界值时的减速度
        this.outFactor = this._getValue(option.outFactor, 0.3);
        // ===== 移动的最小值
        this.min = option.min;
        // ===== 移动的最大值
        this.max = option.max;
        // ===== 加速度
        this.deceleration = 0.0006;
        // 惯性运动超出边界的最大值-用户手动拖拽的距离
        this.maxRegion = this._getValue(option.maxRegion, 600);
        // 弹性最大偏移量
        this.springMaxRegion = this._getValue(option.springMaxRegion, 60);
        // 最大速度
        this.maxSpeed = option.maxSpeed;
        // 是否有最大速度
        this.hasMaxSpeed = !(this.maxSpeed === void 0);
        // 方向锁
        this.lockDirection = this._getValue(option.lockDirection, true);

        var noop = function () { };
        this.change = option.change || noop;
        this.touchEnd = option.touchEnd || noop;
        this.touchStart = option.touchStart || noop;
        this.touchMove = option.touchMove || noop;
        this.touchCancel = option.touchCancel || noop;
        // 以回弹结束运动的回调方法
        this.reboundEnd = option.reboundEnd || noop;
        // 运动结束回调
        this.animationEnd = option.animationEnd || noop;
        // 修正滚动end的回调
        this.correctionEnd = option.correctionEnd || noop;
        this.tap = option.tap || noop;
        this.pressMove = option.pressMove || noop;
        // 取消DOM的默认事件
        this.preventDefault = this._getValue(option.preventDefault, true);
        // 对正则表达式中的DOM元素不取消默认事件
        this.preventDefaultException = { tagName: /^(INPUT|TEXTAREA|BUTTON|SELECT)$/ };
        this.hasMin = !(this.min === void 0);
        this.hasMax = !(this.max === void 0);
        // 最小值不能比最大值来的大
        if (this.hasMin && this.hasMax && this.min > this.max) {
            throw "the min value can't be greater than the max value."
        }
        // 触摸开始标识
        this.isTouchStart = false;
        // 矫正到step倍
        this.step = option.step;
        // 惯性标识 => true 开启
        this.inertia = this._getValue(option.inertia, true);

        this._calculateIndex();
        // 监听事件的target
        this.eventTarget = window;
        // 是否绑定自身的touch事件
        if(option.bindSelf){
            this.eventTarget = this.element;
        }
        
        this._moveHandler = this._move.bind(this);
        bind(this.element, "touchstart", this._start.bind(this));
        bind(this.eventTarget, "touchend", this._end.bind(this));
        bind(this.eventTarget, "touchcancel", this._cancel.bind(this));
        // passive => 表示 listener 永远不会调用 preventDefault()。如果 listener 仍然调用了这个函数，客户端将会忽略它并抛出一个控制台警告。
        // capture => true表示在补货阶段触发
        this.eventTarget.addEventListener("touchmove", this._moveHandler, { passive: false, capture: false });
        this.x1 = this.x2 = this.y1 = this.y2 = null;
    };

    AlloyTouch.prototype = {

        /**
         * 获取给定的值
         * 为空则返回默认值
         * @param {*} obj 返回的目标值
         * @param {*} defaultValue 默认值
         * @returns
         */
        _getValue: function (obj, defaultValue) {
            return obj === void 0 ? defaultValue : obj;
        },
        stop:function(){
            cancelAnimationFrame(this.tickID);
            this._calculateIndex();
        },
        /**
         * touchstart eventlistener handle
         *
         * @param {*} evt
         */
        _start: function (evt) {
            this.isTouchStart = true;
            // 执行option中的touchStart回调函数
            this.touchStart.call(this, evt, this.target[this.property]);
            // 取消一个先前通过调用window.requestAnimationFrame()方法添加到计划中的动画帧请求.
            cancelAnimationFrame(this.tickID);
            this._calculateIndex();
            // 记录一些初始数据
            this.startTime = new Date().getTime();
            this.x1 = this.preX = evt.touches[0].pageX;
            this.y1 = this.preY = evt.touches[0].pageY;
            this.start = this.vertical ? this.preY : this.preX;
            this._firstTouchMove = true;
            this._preventMove = false;
        },
        /**
         * touchmove listener handle
         *
         * @param {*} evt
         */
        _move: function (evt) {
            if (this.isTouchStart) {
                var len = evt.touches.length,
                    currentX = evt.touches[0].pageX,
                    currentY = evt.touches[0].pageY;

                if (this._firstTouchMove && this.lockDirection) {
                    // 判断此次move, 是纵向移动的多还是横向移动
                    var dDis = Math.abs(currentX - this.x1) - Math.abs(currentY - this.y1);

                    if (dDis > 0 && this.vertical) {
                        // 横向移动距离大于纵向,但是指定的移动方向是纵向
                        // 取消移动
                        this._preventMove = true;
                    } else if (dDis < 0 && !this.vertical) {
                        // 横向移动距离小于纵向,但是指定的移动方向是横向
                        // 取消移动
                        this._preventMove = true;
                    }
                    this._firstTouchMove = false;
                }
                if(!this._preventMove) {
                    // 计算移动的距离 会乘上灵敏度
                    var d = (this.vertical ? currentY - this.preY : currentX - this.preX) * this.sensitivity;
                    var f = this.moveFactor;
                    // 如果已经到了所设置的极值,进行减速操作
                    if (this.hasMax && this.target[this.property] > this.max && d > 0) {
                        f = this.outFactor;
                    } else if (this.hasMin && this.target[this.property] < this.min && d < 0) {
                        f = this.outFactor;
                    }
                    // 摩擦系数后的距离
                    d *= f;
                    this.preX = currentX;
                    this.preY = currentY;
                    // 开启滚动的情况下执行滚动
                    if (!this.fixed) {
                        this.target[this.property] += d;
                    }
                    // 执行change回调
                    this.change.call(this, this.target[this.property]);
                    // 于touchStart间隔大于300ms, 重置开始的变量
                    var timestamp = new Date().getTime();
                    if (timestamp - this.startTime > 300) {
                        this.startTime = timestamp;
                        this.start = this.vertical ? this.preY : this.preX;
                    }
                    // 执行touchMove回调
                    this.touchMove.call(this, evt, this.target[this.property]);
                }
                // 去掉DOM默认操作
                if (this.preventDefault && !preventDefaultTest(evt.target, this.preventDefaultException)) {
                    evt.preventDefault();
                }
                // 不明??
                if (len === 1) {
                    if (this.x2 !== null) {
                        evt.deltaX = currentX - this.x2;
                        evt.deltaY = currentY - this.y2;

                    } else {
                        evt.deltaX = 0;
                        evt.deltaY = 0;
                    }
                    this.pressMove.call(this, evt, this.target[this.property]);
                }
                this.x2 = currentX;
                this.y2 = currentY;
            }
        },
        /**
         * touchcancel listener handle
         *
         * @param {*} evt
         */
        _cancel: function (evt) {
            var current = this.target[this.property];
            this.touchCancel.call(this, evt, current);
            this._end(evt);

        },
        to: function (v, time, user_ease) {
            this._to(v, this._getValue(time, 600), user_ease || ease, this.change, function (value) {
                this._calculateIndex();
                this.reboundEnd.call(this, value);
                this.animationEnd.call(this, value);
            }.bind(this));

        },
        /**
         * 计算当前移动距离对于step的倍数
         * step为DOM宽高的话,就相当于是第几个DOM了
         */
        _calculateIndex: function () {
            if (this.hasMax && this.hasMin) {
                this.currentPage = Math.round((this.max - this.target[this.property]) / this.step);
            }
        },
        /**
         * touchend listener handle
         * touchcancel 也会执行到次end方法
         * @param {*} evt
         * @returns
         */
        _end: function (evt) {
            if (this.isTouchStart) {
                // 将开始touch标识置为false
                this.isTouchStart = false;
                var self = this,
                    // 当前移动量
                    current = this.target[this.property],
                    // 判断类型是否Tap
                    triggerTap = (Math.abs(evt.changedTouches[0].pageX - this.x1) < 30 && Math.abs(evt.changedTouches[0].pageY - this.y1) < 30);
                // 如果是Tap就执行对应的Tap回调
                if (triggerTap) {
                    this.tap.call(this, evt, current);
                }
                // touchEnd回调返回false, 结束end,不再惯性
                if (this.touchEnd.call(this, evt, current, this.currentPage) === false) return;
                if (this.hasMax && current > this.max) { // 结束滚动的时候大于最大值
                    this._to(this.max, 200, ease, this.change, function (value) {
                        // 回弹结束的回调方法
                        this.reboundEnd.call(this, value);
                        // 动画结束的回调方法
                        this.animationEnd.call(this, value);
                    }.bind(this));
                } else if (this.hasMin && current < this.min) { // 结束滚动的时候小于最小值
                    this._to(this.min, 200, ease, this.change, function (value) {
                        this.reboundEnd.call(this, value);
                        this.animationEnd.call(this, value);
                    }.bind(this));
                } else if (this.inertia && !triggerTap && !this._preventMove) { // 没有到达临界点 && 开启惯性滚动 && 没有取消移动 && 不是tap点击事件
                    // 滑动的总时间
                    var dt = new Date().getTime() - this.startTime;
                    if (dt < 300) {
                        // 计算移动的总距离(this.sensitivity: 敏感度变量)
                        var distance = ((this.vertical ? evt.changedTouches[0].pageY : evt.changedTouches[0].pageX) - this.start) * this.sensitivity,
                            // 速度
                            speed = Math.abs(distance) / dt,
                            // 算上映射关系后的速度
                            speed2 = this.factor * speed;
                        // 修正速度不得超过最大速度
                        if(this.hasMaxSpeed&&speed2>this.maxSpeed) {
                            speed2 = this.maxSpeed;
                        }
                        // 计算出惯性滚动的目标位置
                        // speed2(速度) / this.deceleration(加速度) = 时间
                        // (speed2 / 2)(一半的速度) * 时间 = 惯性移动距离
                        // (distance < 0 ? -1 : 1) 考虑上transform左负右正
                        var destination = current + (speed2 * speed2) / (2 * this.deceleration) * (distance < 0 ? -1 : 1);

                        var tRatio = 1;
                        // 计算惯性滚动如果碰壁应该(不能完成一次完整滚动)如何处理
                        if (destination < this.min ) {
                            if (destination < this.min - this.maxRegion) { // 目标位置小于 最小移动距离和最大惯性滚动范围之和
                                // 计算实际移动距离[this.min - this.springMaxRegion]对于完整移动距离[destination]的占比
                                tRatio = reverseEase((current - this.min + this.springMaxRegion) / (current - destination));
                                // 实际移动距离
                                destination = this.min - this.springMaxRegion;
                            } else {
                                tRatio = reverseEase((current - this.min + this.springMaxRegion * (this.min - destination) / this.maxRegion) / (current - destination));
                                destination = this.min - this.springMaxRegion * (this.min - destination) / this.maxRegion;
                            }
                        } else if (destination > this.max) {
                            if (destination > this.max + this.maxRegion) {
                                tRatio = reverseEase((this.max + this.springMaxRegion - current) / (destination - current));
                                destination = this.max + this.springMaxRegion;
                            } else {
                                tRatio = reverseEase((this.max + this.springMaxRegion * ( destination-this.max) / this.maxRegion - current) / (destination - current));
                                destination = this.max + this.springMaxRegion * (destination - this.max) / this.maxRegion;

                            }
                        }
                        // 持续时间
                        var duration = Math.round(speed / self.deceleration) * tRatio;
                        // 移动到目标位
                        self._to(Math.round(destination), duration, ease, self.change, function (value) {
                            if (self.hasMax && self.target[self.property] > self.max) {
                                // 惯性滑动结束后,超过最大值,取消动画
                                cancelAnimationFrame(self.tickID);
                                // 回弹到最大值
                                self._to(self.max, 600, ease, self.change, self.animationEnd);

                            } else if (self.hasMin && self.target[self.property] < self.min) {
                                // 惯性滑动结束后,超过最小值,取消动画
                                cancelAnimationFrame(self.tickID);
                                // 回弹到最小值
                                self._to(self.min, 600, ease, self.change, self.animationEnd);

                            } else {
                                if(self.step) {
                                    // 有修正的,就进行修正
                                    self._correction()
                                }else{
                                    // 无修直接结束
                                    self.animationEnd.call(self, value);
                                }
                            }

                            self.change.call(this, value);
                        });


                    } else {
                        self._correction();
                    }
                } else {
                    self._correction();
                }
                // if (this.preventDefault && !preventDefaultTest(evt.target, this.preventDefaultException)) {
                //     evt.preventDefault();
                // }

            }
            // 清空数据
            this.x1 = this.x2 = this.y1 = this.y2 = null;

        },
        /**
         * 内部使用
         * 回弹效果的实现
         *
         * @param {*} value 要移动到的目标值
         * @param {*} time 时间
         * @param {*} ease 缓动函数
         * @param {*} onChange change回调函数
         * @param {*} onEnd end回调函数
         * @returns
         */
        _to: function (value, time, ease, onChange, onEnd) {
            if (this.fixed) return;
            var el = this.target,
                property = this.property;
            // 当前移动的值
            var current = el[property];
            // 目标值和当前值的差值
            var dv = value - current;
            // 记录开始时间
            var beginTime = new Date();
            var self = this;
            var toTick = function () {

                var dt = new Date() - beginTime;
                // 达到目标time, 移动到目标位置
                // 执行对应回调函数
                if (dt >= time) {
                    el[property] = value;
                    onChange && onChange.call(self, value);
                    onEnd && onEnd.call(self, value);
                    return;
                }
                // 利用ease缓动函数进行惯性偏移
                el[property] = dv * ease(dt / time) + current;
                // 没有达到要求的时间,继续调用
                self.tickID = requestAnimationFrame(toTick);
                //cancelAnimationFrame必须在 tickID = requestAnimationFrame(toTick);的后面
                onChange && onChange.call(self, el[property]);
            };
            toTick();
        },
        /**
         * 修正到step倍数
         * 可以实现滑元素一半的让其修正到一整个元素
         * @returns
         */
        _correction: function () {
            if (this.step === void 0) return;
            var el = this.target,
                property = this.property;
            var value = el[property];
            // 当前值step的倍数
            var rpt = Math.floor(Math.abs(value / this.step));
            // 当前值/step的余数
            var dy = value % this.step;
            if (Math.abs(dy) > this.step / 2) {
                // 大于step的一半, 修正为下一个
                this._to((value < 0 ? -1 : 1) * (rpt + 1) * this.step, 400, ease, this.change, function (value) {
                    this._calculateIndex();
                    this.correctionEnd.call(this, value);
                    this.animationEnd.call(this, value);
                }.bind(this));
            } else {
                // 小于step的一半, 修正为上一个
                this._to((value < 0 ? -1 : 1) * rpt * this.step, 400, ease, this.change, function (value) {
                    this._calculateIndex();
                    this.correctionEnd.call(this, value);
                    this.animationEnd.call(this, value);
                }.bind(this));
            }
        }
    };

    if (typeof module !== 'undefined' && typeof exports === 'object') {
        module.exports = AlloyTouch;
    } else {
        window.AlloyTouch = AlloyTouch;
    }

})();
