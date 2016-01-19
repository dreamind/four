FOUR.MarqueeSelectionController = (function () {

  /**
   * Marquee selection controller. On camera update, the controller filters the
   * scene to get the set of objects that are inside the camera frustum. It then
   * adds the projected screen coordinates for each object to a quadtree. When
   * a marquee selection event occurs, we then search for objects by their
   * screen coordinates.
   * @param {Object} config Configuration
   * @constructor
   */
  function MarqueeSelectionController(config) {
    THREE.EventDispatcher.call(this);
    config = config || {};
    var self = this;

    // the number of pixels that the mouse must move before we interpret the
    // mouse action as marquee selection
    self.EPS = 2;

    // wait for the timeout to expire before indexing the scene
    self.INDEX_TIMEOUT = 500;

    self.KEY = {ALT: 18, CTRL: 17, SHIFT: 16};
    self.SELECT_ACTIONS = {ADD: 0, REMOVE: 1, SELECT: 2};
    self.MOUSE_STATE = {DOWN: 0, UP: 1};

    self.camera = config.camera;
    self.domElement = config.viewport.domElement;
    self.enabled = false;
    self.filter = null;
    self.filters = {
      all: self.selectAll,
      nearest: self.selectNearest,
      objects: self.selectObjects,
      points: self.selectPoints
    };
    self.frustum = new THREE.Frustum();
    self.index = new FOUR.ViewIndex();
    self.indexingTimeout = null;
    self.listeners = {};
    self.marquee = document.getElementById('marquee');
    self.modifiers = {};
    self.mouse = {
      end: new THREE.Vector2(),
      start: new THREE.Vector2(),
      state: self.MOUSE_STATE.UP
    };
    self.selectAction = self.SELECT_ACTIONS.SELECT;
    self.selection = [];
    self.viewport = config.viewport;

    Object.keys(self.KEY).forEach(function (key) {
      self.modifiers[self.KEY[key]] = false;
    });
  }

  MarqueeSelectionController.prototype = Object.create(THREE.EventDispatcher.prototype);

  MarqueeSelectionController.prototype.disable = function () {
    var self = this;
    self.enabled = false;
    self.hideMarquee();
    Object.keys(self.listeners).forEach(function (key) {
      var listener = self.listeners[key];
      listener.element.removeEventListener(listener.event, listener.fn);
    });
  };

  MarqueeSelectionController.prototype.enable = function () {
    var self = this;
    self.camera = self.viewport.getCamera();
    function addListener(element, event, fn) {
      self.listeners[event] = {
        element: element,
        event: event,
        fn: fn.bind(self)
      };
      element.addEventListener(event, self.listeners[event].fn, false);
    }

    addListener(self.camera, 'update', self.onCameraUpdate);
    addListener(self.viewport, 'camera-change', self.onCameraChange);
    addListener(self.viewport.domElement, 'mousedown', self.onMouseDown);
    addListener(self.viewport.domElement, 'mousemove', self.onMouseMove);
    addListener(self.viewport.domElement, 'mouseup', self.onMouseUp);
    addListener(window, 'keydown', self.onKeyDown);
    addListener(window, 'keyup', self.onKeyUp);
    addListener(window, 'resize', self.onWindowResize);
    self.enabled = true;
    // FIXME the first time the index runs it appears to get every scene object
    self.buildIndex();
  };

  MarqueeSelectionController.prototype.hideMarquee = function () {
    this.marquee.setAttribute('style', 'display:none;');
  };



  MarqueeSelectionController.prototype.onCameraChange = function () {
    this.disable();
    this.enable();
  };

  MarqueeSelectionController.prototype.onCameraUpdate = function () {
    this.reindex();
  };

  MarqueeSelectionController.prototype.onContextMenu = function (event) {
    event.preventDefault();
  };

  MarqueeSelectionController.prototype.onKeyDown = function (event) {
    if (event.keyCode === this.KEY.ALT) {
      this.selectAction = this.SELECT_ACTIONS.REMOVE;
    } else if (event.keyCode === this.KEY.SHIFT) {
      this.selectAction = this.SELECT_ACTIONS.ADD;
    }
  };

  MarqueeSelectionController.prototype.onKeyUp = function (event) {
    if (event.keyCode === this.KEY.ALT) {
      this.selectAction = this.SELECT_ACTIONS.SELECT;
    } else if (event.keyCode === this.KEY.SHIFT) {
      this.selectAction = this.SELECT_ACTIONS.SELECT;
    }
  };

  MarqueeSelectionController.prototype.onMouseDown = function (event) {
    if (event.button === THREE.MOUSE.LEFT) {
      event.preventDefault();
      this.mouse.state = this.MOUSE_STATE.DOWN;
      this.mouse.start.set(event.pageX, event.pageY);
      this.mouse.end.copy(event.pageX, event.pageY);
    }
  };

  MarqueeSelectionController.prototype.onMouseMove = function (event) {
    var delta = new THREE.Vector2(event.offsetX, event.offsetY).sub(this.mouse.start).length();
    if (this.mouse.state === this.MOUSE_STATE.DOWN && delta > this.EPS) {
      //console.info('marquee selection');
      event.preventDefault();
      event.stopPropagation();
      // draw the selection marquee
      this.mouse.end.set(event.offsetX, event.offsetY);
      var width = Math.abs(this.mouse.end.x - this.mouse.start.x);
      var height = Math.abs(this.mouse.end.y - this.mouse.start.y);
      // drawn from top left to bottom right
      if (this.mouse.end.x > this.mouse.start.x && this.mouse.end.y > this.mouse.start.y) {
        this.setMarqueePosition(this.mouse.start.x, this.mouse.start.y, width, height);
      }
      // drawn from the top right to the bottom left
      else if (this.mouse.end.x < this.mouse.start.x && this.mouse.end.y > this.mouse.start.y) {
        this.setMarqueePosition(this.mouse.end.x, this.mouse.start.y, width, height);
      }
      // drawn from the bottom left to the top right
      else if (this.mouse.end.x > this.mouse.start.x && this.mouse.end.y < this.mouse.start.y) {
        this.setMarqueePosition(this.mouse.start.x, this.mouse.end.y, width, height);
      }
      // drawn from the bottom right to the top left
      else if (this.mouse.end.x < this.mouse.start.x && this.mouse.end.y < this.mouse.start.y) {
        this.setMarqueePosition(this.mouse.end.x, this.mouse.end.y, width, height);
      }
    }
  };

  MarqueeSelectionController.prototype.onMouseUp = function (event) {
    if (this.mouse.state === this.MOUSE_STATE.DOWN && event.button === THREE.MOUSE.LEFT) {
      event.preventDefault();
      event.stopPropagation();
      this.mouse.state = this.MOUSE_STATE.UP;
      // hide the selection marquee
      this.hideMarquee();
      // emit the selection event
      var width = Math.abs(this.mouse.end.x - this.mouse.start.x);
      var height = Math.abs(this.mouse.end.y - this.mouse.start.y);
      // drawn from top left to bottom right
      if (this.mouse.end.x > this.mouse.start.x && this.mouse.end.y > this.mouse.start.y) {
        this.select(this.mouse.start.x, this.mouse.start.y, width, height);
      }
      // drawn from the top right to the bottom left
      else if (this.mouse.end.x < this.mouse.start.x && this.mouse.end.y > this.mouse.start.y) {
        this.select(this.mouse.end.x, this.mouse.start.y, width, height);
      }
      // drawn from the bottom left to the top right
      else if (this.mouse.end.x > this.mouse.start.x && this.mouse.end.y < this.mouse.start.y) {
        this.select(this.mouse.start.x, this.mouse.end.y, width, height);
      }
      // drawn from the bottom right to the top left
      else if (this.mouse.end.x < this.mouse.start.x && this.mouse.end.y < this.mouse.start.y) {
        this.select(this.mouse.end.x, this.mouse.end.y, width, height);
      }
    }
  };

  MarqueeSelectionController.prototype.onWindowResize = function () {
  };

  /**
   * Execute the indexing operation after the timeout expires to ensure that
   * we update the index only after the camera has stopped moving.
   */
  MarqueeSelectionController.prototype.reindex = function () {
    if (this.indexingTimeout) {
      clearTimeout(this.indexingTimeout);
      this.indexingTimeout = null;
    }
    this.indexingTimeout = setTimeout(this.buildIndex.bind(this), this.INDEX_TIMEOUT);
  };

  /**
   * Select entities by marquee.
   * @param {Number} x Selection top left screen X coordinate
   * @param {Number} y Selection top left screen Y coordinate
   * @param {Number} width Selection bottom right screen X coordinate
   * @param {Number} height Selection bottom right screen Y coordinate
   */
  MarqueeSelectionController.prototype.select = function (x, y, width, height) {
    // find entities that are wholly contained inside the selection marquee
    var r1 = {p1: {}, p2: {}}, r2 = {p1: {}, p2: {}};
    this.selection = this.quadtree.colliding({x: x, y: y, width: width, height: height}, function (selection, obj) {
      r1.p1.x = obj.x;
      r1.p1.y = obj.y;
      r1.p2.x = obj.x + obj.width;
      r1.p2.y = obj.y + obj.height;
      r2.p1.x = selection.x;
      r2.p1.y = selection.y;
      r2.p2.x = selection.x + selection.width;
      r2.p2.y = selection.y + selection.height;
      return FOUR.utils.isContained(r1, r2);
    });
    // dispatch selection event
    if (this.selectAction === this.SELECT_ACTIONS.ADD) {
      this.dispatchEvent({type: 'add', selection: this.selection});
    } else if (this.selectAction === this.SELECT_ACTIONS.REMOVE) {
      this.dispatchEvent({type: 'remove', selection: this.selection});
    } else if (this.selectAction === this.SELECT_ACTIONS.SELECT) {
      this.dispatchEvent({type: 'select', selection: this.selection});
    }
  };

  /**
   * Set selection filter.
   */
  MarqueeSelectionController.prototype.setFilter = function () {
    throw new Error('not implemented');
  };

  /**
   * Set the marquee screen position.
   * @param {Number} x Marquee top left screen X coordinate
   * @param {Number} y Marquee top left screen Y coordinate
   * @param {Number} w Marquee bottom right screen X coordinate
   * @param {Number} h Marquee bottom right screen Y coordinate
   */
  MarqueeSelectionController.prototype.setMarqueePosition = function (x, y, w, h) {
    this.marquee.setAttribute('style', 'display:block;left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px;');
  };

  MarqueeSelectionController.prototype.update = function () {}; // noop

  return MarqueeSelectionController;

}());
