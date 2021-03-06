FOUR.Overlay = (function () {

    /**
     * Scene overlay manager. Handles creation and positioning of scene overlay
     * labels.
     */
    function Overlay (config) {
        THREE.EventDispatcher.call(this);

        var self = this;

        // overlay positioning strategy
        self.POSITION = {
            CENTER: 0,
            TOP: 1,
            BOTTOM: 2,
            LEFT: 3,
            RIGHT: 4,
            FIXED: 6
        };

        self.domElement = config.domElement || config.viewport.domElement;
        self.elements = {};
        self.enabled = false;
        self.listeners = {};
        self.viewport = config.viewport;

        Object.keys(config).forEach(function (key) {
            self[key] = config[key];
        });
    }

    Overlay.prototype = Object.create(THREE.EventDispatcher.prototype);

    /**
     * Add overlay element.
     * @param {Object} config Configuration
     *
     * {
     *   position: self.POSITION.CENTER,
     *   innerHTML: '<h1>Title</h1><p>Content</p>',
     *   target: [scene entity UUID],
     *   index: [scene entity index if tracking a point]
     * }
     *
     */
    Overlay.prototype.add = function (config) {
        // generate a random ID
        config.id = 'overlay-' + Date.now();
        config.element = document.createElement('div');
        config.element.className = config.className || 'label';
        config.element.id = config.id;
        config.element.innerHTML = config.innerHTML;

        this.domElement.appendChild(config.element);
        this.elements[config.id] = config;
        this.update();
        return config;
    };

    /**
     * Remove all overlay elements.
     */
    Overlay.prototype.clear = function () {
        var self = this;
        Object.keys(this.elements).forEach(function (id) {
            self.remove(id);
        });
    };

    /**
     * Disable the controller.
     */
    Overlay.prototype.disable = function () {
        var self = this;
        self.enabled = false;
        Object.keys(self.listeners).forEach(function (key) {
            var listener = self.listeners[key];
            listener.element.removeEventListener(listener.event, listener.fn);
        });
    };

    /**
     * Enable the controller.
     */
    Overlay.prototype.enable = function () {
        var self = this;
        self.enabled = true;
    };

    Overlay.prototype.onMouseMove = function (event) {};

    Overlay.prototype.onMouseOver = function (event) {};

    Overlay.prototype.onMouseUp = function (event) {};

    /**
     * Remove overlay element.
     * @param {String} id Identifier
     */
    Overlay.prototype.remove = function (id) {
        var el = document.getElementById(id);
        this.domElement.removeChild(el);
        delete this.elements[id];
    };

    /**
     * Update the position of overlay elements.
     */
    Overlay.prototype.update = function () {
        var dummy, el, height, obj, offset, screen, self = this, width;
        var camera = this.viewport.getCamera();
        var scene = this.viewport.getScene();

        Object.keys(this.elements).forEach(function (key) {
            el = self.elements[key];

            if (el.position !== self.POSITION.FIXED) {
                offset = el.offset || 0;
                obj = scene.getObjectByProperty('uuid', el.target);
                if (el.index) {} // point elements
                if (obj instanceof THREE.Line) {
                    obj.geometry.computeBoundingSphere();
                    dummy = new THREE.Object3D();
                    dummy.position.copy(obj.geometry.boundingSphere.center);
                    screen = FOUR.utils.getObjectScreenCoordinates(
                      dummy,
                      camera,
                      self.viewport.domElement.clientWidth,
                      self.viewport.domElement.clientHeight);
                } else {
                    screen = FOUR.utils.getObjectScreenCoordinates(
                      obj,
                      camera,
                      self.viewport.domElement.clientWidth,
                      self.viewport.domElement.clientHeight);
                }
                el.element.style.left = (screen.x + offset) + 'px';
                el.element.style.top = (screen.y + offset) + 'px';
            } else {
                el.element.style.left = (el.left + offset) + 'px';
                el.element.style.top = (el.top + offset) + 'px';
            }
        });
    };

    return Overlay;

}());
