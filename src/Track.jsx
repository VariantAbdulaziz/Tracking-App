import React, { useEffect, useRef, useState } from "react";

import { useOpenCv } from "opencv-react";

function Track() {
  const { loaded, cv } = useOpenCv();
  const vidRef = useRef();
  const canvasRef = useRef();
  const overlayRef = useRef();
  const [startX, setStartX] = useState(null);
  const [startY, setStartY] = useState(null);
  const [isDown, setIsDown] = useState(false);
  const [rect, setRect] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [timeoutId, setTimeoutId] = useState();
  // const [videoOn, setVideoOn] = useState(false);

  const onVideoChange = (e) => {
    console.log("e >> ", e.target.files[0]);
    vidRef.current.src = URL.createObjectURL(e.target.files[0]);
    setIsLoaded(true);
    NotAnnotatedFollowArround();
    // setVideoOn(true);
    //imgElement.onload = function () {
    //};
  };

  const NotAnnotatedFollowArround = () => {
    console.log(loaded, cv);
    let video = vidRef.current;
    let cap = new cv.VideoCapture(video);
    // take first frame of the video
    let frame = new cv.Mat(video.height, video.width, cv.CV_8UC4);
    cap.read(frame);
    cv.imshow("canvasOutput", frame);
    // cv.imshow("overlay", frame);
    if (streaming && rect.length !== 4 && !isDown) {
      const id = setTimeout(NotAnnotatedFollowArround, 30);
      setTimeoutId((prev) => {
        clearTimeout(prev);
        return id;
      });
    }
  };

  const followAround = async () => {
    let video = vidRef.current;
    let cap = new cv.VideoCapture(video);
    // take first frame of the video
    let frame = new cv.Mat(video.height, video.width, cv.CV_8UC4);
    cap.read(frame);
    // hardcode the initial location of window
    let trackWindow = new cv.Rect(...rect);

    // set up the ROI for tracking
    let roi = frame.roi(trackWindow);
    let hsvRoi = new cv.Mat();
    cv.cvtColor(roi, hsvRoi, cv.COLOR_RGBA2RGB);
    cv.cvtColor(hsvRoi, hsvRoi, cv.COLOR_RGB2HSV);
    let mask = new cv.Mat();
    let lowScalar = new cv.Scalar(30, 30, 0);
    let highScalar = new cv.Scalar(180, 180, 180);
    let low = new cv.Mat(hsvRoi.rows, hsvRoi.cols, hsvRoi.type(), lowScalar);
    let high = new cv.Mat(hsvRoi.rows, hsvRoi.cols, hsvRoi.type(), highScalar);
    cv.inRange(hsvRoi, low, high, mask);
    let roiHist = new cv.Mat();
    let hsvRoiVec = new cv.MatVector();
    hsvRoiVec.push_back(hsvRoi);
    cv.calcHist(hsvRoiVec, [0], mask, roiHist, [180], [0, 180]);
    cv.normalize(roiHist, roiHist, 0, 255, cv.NORM_MINMAX);

    // delete useless mats.
    roi.delete();
    hsvRoi.delete();
    mask.delete();
    low.delete();
    high.delete();
    hsvRoiVec.delete();

    // Setup the termination criteria, either 10 iteration or move by at least 1 pt
    let termCrit = new cv.TermCriteria(
      cv.TERM_CRITERIA_EPS | cv.TERM_CRITERIA_COUNT,
      10,
      1
    );

    let hsv = new cv.Mat(video.height, video.width, cv.CV_8UC3);
    let dst = new cv.Mat();
    let hsvVec = new cv.MatVector();
    hsvVec.push_back(hsv);

    const FPS = 30;
    function processVideo() {
      try {
        if (!streaming) {
          // clean and stop.
          frame.delete();
          dst.delete();
          hsvVec.delete();
          roiHist.delete();
          hsv.delete();
          return;
        }
        let begin = Date.now();

        // start processing.
        cap.read(frame);
        cv.cvtColor(frame, hsv, cv.COLOR_RGBA2RGB);
        cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
        cv.calcBackProject(hsvVec, [0], roiHist, dst, [0, 180], 1);

        // Apply meanshift to get the new location
        // and it also returns number of iterations meanShift took to converge,
        // which is useless in this demo.
        [, trackWindow] = cv.meanShift(dst, trackWindow, termCrit);

        // Draw it on image
        let [x, y, w, h] = [
          trackWindow.x,
          trackWindow.y,
          trackWindow.width,
          trackWindow.height,
        ];
        cv.rectangle(
          frame,
          new cv.Point(x, y),
          new cv.Point(x + w, y + h),
          [255, 0, 0, 255],
          2
        );
        cv.imshow("canvasOutput", frame);

        // schedule the next one.
        let delay = 1000 / FPS - (Date.now() - begin);
        const id = setTimeout(processVideo, delay);
        setTimeoutId((prev) => {
          clearTimeout(prev);
          return id;
        });
      } catch (err) {
        console.log(err);
      }
    }

    // schedule the first one.
    try {
      const id = setTimeout(processVideo, 0);
      setTimeoutId((prev) => {
        clearTimeout(prev);
        return id;
      });
    } catch (e) {
      console.log(e);
    }
  };

  function handleMouseDown(e) {
    e.preventDefault();
    e.stopPropagation();
    let canvasOffset = canvasRef.current.getBoundingClientRect();
    let offsetX = canvasOffset.left;
    let offsetY = canvasOffset.top;
    // save the starting x/y of the rectangle
    setStartX(parseInt(e.clientX - offsetX));
    setStartY(parseInt(e.clientY - offsetY));

    // set a flag indicating the drag has begun
    setIsDown(true);
  }

  function handleMouseUp(e) {
    e.preventDefault();
    e.stopPropagation();
    // let ctxo = overlayRef.current.getContext("2d");

    // the drag is over, clear the dragging flag
    setIsDown(false);
    // ctxo.strokeRect(prevStartX, prevStartY, prevWidth, prevHeight);
  }

  function handleMouseOut(e) {
    e.preventDefault();
    e.stopPropagation();

    // the drag is over, clear the dragging flag
    setIsDown(false);
  }

  function handleMouseMove(e) {
    e.preventDefault();
    e.stopPropagation();

    // if we're not dragging, just return
    if (!isDown) {
      return;
    }
    let canvasOffset = canvasRef.current.getBoundingClientRect();
    let offsetX = canvasOffset.left;
    let offsetY = canvasOffset.top;
    let ctx = canvasRef.current.getContext("2d");

    // get the current mouse position
    let mouseX = parseInt(e.clientX - offsetX);
    let mouseY = parseInt(e.clientY - offsetY);

    // Put your mousemove stuff here

    // calculate the rectangle width/height based
    // on starting vs current mouse position
    let width = mouseX - startX;
    let height = mouseY - startY;

    // clear the canvas
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    let video = vidRef.current;
    let cap = new cv.VideoCapture(video);
    // take first frame of the video
    let frame = new cv.Mat(video.height, video.width, cv.CV_8UC4);
    cap.read(frame);
    cv.imshow("canvasOutput", frame);
    clearTimeout(timeoutId);
    // draw a new rect from the start position
    // to the current mouse position
    ctx.beginPath();
    ctx.strokeStyle = "#FF0000";
    ctx.strokeRect(startX, startY, width, height);
    ctx.closePath();
    setRect([startX, startY, width, height]);
  }

  useEffect(() => {
    if (loaded && streaming && rect.length === 4 && !isDown) {
      console.log(rect);
      followAround();
    } else if (loaded) NotAnnotatedFollowArround();
    // else if (loaded) check();
  }, [streaming, isDown, rect, loaded]);

  useEffect(() => {
    if (isDown && isLoaded) vidRef.current.pause();
    else if (!isDown && isLoaded) vidRef.current.play();
  }, [isDown, isLoaded]);

  return loaded ? (
    <div className="flex flex-col ml-32 max-md:mx-4 my-4 gap-4">
      <p>
        Instruction: drag and draw a rectangle in the left box after the video
        is uploaded and see opencv.js do its magic!
      </p>
      <div className="flex">
        <label className="px-4 py-2 rounded-xl bg-blue-400" for="fileInput">
          Upload Video
        </label>
        <input
          type="file"
          id="fileInput"
          name="file"
          className="invisible"
          onChange={(e) => onVideoChange(e)}
        />
      </div>
      <div className="flex gap-4 max-md:flex-col">
        <video
          id="videoInput"
          ref={vidRef}
          width={320}
          height={240}
          className=" border"
          controls
          loop
          muted
          onPlay={() => setStreaming(true)}
          onPause={() => setStreaming(false)}
        />
        <div className="relative">
          <canvas
            id="canvasOutput"
            className="absolute border"
            ref={canvasRef}
            width={320}
            height={240}
          />
          <canvas
            id="overlay"
            ref={overlayRef}
            className="absolute z-10 border hover:cursor-crosshair"
            width={320}
            height={240}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseOut={handleMouseOut}
          />
        </div>
      </div>
    </div>
  ) : (
    <p className="m-8 text-lg">wait until opencv.js is fully loaded ...</p>
  );
}

export default Track;
